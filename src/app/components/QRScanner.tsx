"use client";

import React, { useEffect, useRef, useCallback } from "react";
import jsQR, { QRCode as JsQrCode } from "jsqr"; // Import type for QR Code object

// Define the props expected by the QRScanner component
interface QRScannerProps {
  label: string; // Text label to display over the scanner feed
  onScan: (data: string) => void; // Callback function triggered when a QR code is successfully scanned
}

// The QRScanner functional component
const QRScanner: React.FC<QRScannerProps> = ({ label, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null); // Ref for the video element displaying the camera feed
  const canvasRef = useRef<HTMLCanvasElement>(null); // Ref for the hidden canvas used for processing video frames
  const animationFrameRef = useRef<number | null>(null); // Ref to store the ID of the requestAnimationFrame loop
  const streamRef = useRef<MediaStream | null>(null); // Ref to store the active camera MediaStream

  // Callback function to stop the camera stream and cleanup
  const stopCamera = useCallback(() => {
    // Cancel any pending animation frame to stop the scanning loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    // Stop all tracks in the current media stream
    if (streamRef.current) {
      console.log("[QRScanner] Stopping camera stream tracks.");
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null; // Clear the stream reference
    }
    // Detach the stream from the video element
    if (videoRef.current) {
      // Explicitly pause the video before changing srcObject
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
      videoRef.current.srcObject = null;
      console.log("[QRScanner] Video stream detached and paused.");
    }
  }, []); // Empty dependency array as this function doesn't depend on props or state

  // Effect hook to set up and clean up the camera and scanning loop on component mount
  useEffect(() => {
    let isMounted = true; // Flag to track component mount status for async operations

    // Async function to request camera access and start the video feed
    async function startCameraAndScan() {
      // Check if browser supports necessary media APIs
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error(
          "[QRScanner] getUserMedia is not supported in this browser."
        );
        alert("Camera access is not supported by this browser."); // Inform user
        return;
      }

      try {
        console.log("[QRScanner] Requesting camera access...");
        // Request video stream, preferring the rear camera ('environment')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        // If component unmounted while waiting for permission, stop the stream
        if (!isMounted) {
          console.log(
            "[QRScanner] Component unmounted before stream ready, stopping tracks."
          );
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        // Store the stream reference for later cleanup
        streamRef.current = stream;

        // If the video element ref is available, attach the stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for video metadata to load to ensure dimensions are available
          videoRef.current.onloadedmetadata = () => {
            if (isMounted && videoRef.current) {
              // Attempt to play the video feed
              const playPromise = videoRef.current.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log("[QRScanner] Camera stream playback started.");
                    // Start the scanning loop only after playback starts
                    if (isMounted) {
                      // Double check mount status
                      animationFrameRef.current = requestAnimationFrame(tick);
                    }
                  })
                  .catch((playErr) => {
                    if (isMounted) {
                      // Only log error if still mounted
                      console.error(
                        "[QRScanner] Video play promise rejected:",
                        playErr
                      );
                      alert(
                        "Could not play video stream. Autoplay might be blocked or an error occurred."
                      );
                    }
                  });
              }
            }
          };
          // Handle potential errors on the video element itself
          videoRef.current.onerror = (e) => {
            if (isMounted) {
              console.error("[QRScanner] Video element error:", e);
              alert("An error occurred with the video stream.");
            }
          };
        } else {
          console.warn(
            "[QRScanner] Video element ref not available when stream ready."
          );
          stopCamera(); // Clean up stream if video element isn't ready
        }
      } catch (err) {
        // Handle errors during camera access request
        if (isMounted) {
          console.error("[QRScanner] Camera access error: ", err);
          if (err instanceof Error && err.name === "NotAllowedError") {
            alert(
              "Camera permission was denied. Please allow camera access in your browser settings and refresh the page."
            );
          } else {
            alert(
              `Could not access camera: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
      }
    }

    // The core scanning loop function, called repeatedly via requestAnimationFrame
    const tick = () => {
      // Stop the loop if the component has unmounted
      if (!isMounted) {
        console.log("[QRScanner] Tick aborted: Component unmounted.");
        return;
      }

      // Check if video is ready and canvas exists
      if (
        videoRef.current &&
        videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && // Ensure video frame data is available
        !videoRef.current.paused && // Ensure video is playing
        videoRef.current.videoWidth > 0 && // Ensure video has dimensions
        canvasRef.current
      ) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        // Get 2D context, hinting that we'll read pixel data frequently
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (context) {
          // Match canvas size to the actual video dimensions
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Draw the current video frame onto the hidden canvas
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          try {
            // Get the pixel data from the entire canvas
            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );
            // Attempt to find and decode a QR code within the image data
            const code: JsQrCode | null = jsQR(
              imageData.data,
              imageData.width,
              imageData.height,
              {
                inversionAttempts: "dontInvert", // Standard setting for regular QR codes
              }
            );

            // If a QR code is successfully decoded
            if (code && code.data) {
              console.log("[QRScanner] QR Code detected:", code.data);
              stopCamera(); // Stop the camera and scanning loop
              onScan(code.data); // Execute the callback function with the decoded data
              return; // Exit the loop successfully
            }
          } catch (decodeError) {
            // Log any errors during QR decoding but continue the loop
            // console.error("[QRScanner] jsQR decoding error:", decodeError); // Can be noisy
          }
        }
      }
      // If no QR code found or video not ready, request the next frame
      if (isMounted) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    // Start the process when the component mounts
    startCameraAndScan();

    // Cleanup function: This runs when the component unmounts
    return () => {
      console.log("[QRScanner] Unmounting component...");
      isMounted = false; // Set flag to stop loops/async operations
      stopCamera(); // Call the cleanup function to stop camera and animation frames
    };
  }, [onScan, stopCamera]); // Dependencies: onScan callback and the stable stopCamera function

  // Render the component UI
  return (
    <div className="relative w-full max-w-md mx-auto border-2 border-gray-400 rounded-lg overflow-hidden shadow-lg bg-black aspect-video">
      {" "}
      {/* Using aspect-video for a common camera ratio */}
      {/* Video element to display the camera feed */}
      <video
        ref={videoRef}
        className="block w-full h-full object-cover" // Make video cover the container
        muted // Essential to prevent audio echo
        playsInline // Essential for mobile browser playback
        // Optional: Flip video horizontally if needed (e.g., some cameras mirror)
        // style={{ transform: 'scaleX(-1)' }}
      />
      {/* Text label overlay */}
      <div className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-70 text-white text-xs sm:text-sm rounded shadow">
        {label}
      </div>
      {/* Hidden canvas element used for processing video frames */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
};

// Export the component as the default export
export default QRScanner;

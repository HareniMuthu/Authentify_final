"use client";

import React, { useEffect, useRef } from "react";
import jsQR from "jsqr";

interface QRScannerProps {
  label: string;
  onScan: (data: string) => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ label, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanningRef = useRef<boolean>(true);

  useEffect(() => {
    const constraints = { video: { facingMode: "environment" } };

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanningRef.current = true;
        tick();
      } catch (err) {
        console.error("Camera error: ", err);
      }
    }

    const tick = () => {
      if (!scanningRef.current) return;
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          if (code && code.data) {
            onScan(code.data);
            scanningRef.current = false;
            if (video.srcObject instanceof MediaStream) {
              video.srcObject.getTracks().forEach((track) => track.stop());
            }
            return;
          }
        }
      }
      setTimeout(() => requestAnimationFrame(tick), 250);
    };

    startCamera();

    return () => {
      scanningRef.current = false;
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, [onScan]);

  return (
    <div className="relative w-full max-w-md mx-auto border border-gray-300 rounded-lg overflow-hidden shadow-lg bg-white">
      {/* Video feed visible on the page */}
      <video
        ref={videoRef}
        className="w-full h-auto object-cover"
        muted
        playsInline
        style={{ borderRadius: "inherit" }}
      />
      {/* Label overlay */}
      <div className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-50 text-white text-sm rounded">
        {label}
      </div>
      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
};

export default QRScanner;

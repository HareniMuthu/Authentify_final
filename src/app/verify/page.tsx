"use client";
import { useState, ChangeEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import QRScanner from "@/app/components/QRScanner"; // Keep for Product QR scanning
import jsQR from "jsqr"; // Keep for decoding Product QR from image upload
// Assuming this path and function signature are correct based on your project structure
// Assumes decodeImage returns string | null
import { decodeImage } from "../../../lib/steganography";

// Interface for the expected structure of the Product QR data (after JSON parsing)
interface ProductQRData {
  encrypted: string;
  signature: string;
}

export default function VerifyPage() {
  // State for the Product QR data (as a JSON string)
  const [productQRString, setProductQRString] = useState("");
  // State for the Secret Key (will be set *during* verification, or left empty if decode fails)
  const [secretKey, setSecretKey] = useState("");
  // State to hold the Data URL of the uploaded secret key image
  const [uploadedSecretImageSrc, setUploadedSecretImageSrc] = useState<
    string | null
  >(null);
  // State for the verification result message
  const [result, setResult] = useState("");
  // State for displaying errors (will not show specific decode errors now)
  const [error, setError] = useState("");
  // State to control which QR code is being scanned (only "product" now)
  const [scanMode, setScanMode] = useState<"product" | null>(null);
  // Loading state ONLY for the verification process (includes decoding + API call)
  const [isVerifying, setIsVerifying] = useState(false);

  // Handles the verification process (including decoding now)
  const handleVerify = async () => {
    setError(""); // Clear previous general errors
    setResult("");
    setSecretKey(""); // Clear previous decoded key

    // 1. Validate if inputs are provided
    if (!productQRString) {
      setError(
        "Product QR data is missing. Please scan or upload the Product QR."
      );
      return;
    }
    if (!uploadedSecretImageSrc) {
      // Check if secret image was uploaded
      setError(
        "Secret Key Image is missing. Please upload the required image."
      );
      return;
    }

    setIsVerifying(true); // Start loading indicator

    // 2. Attempt to decode the Secret Key Image
    const image = new Image();
    image.onload = async () => {
      // Make the onload async to use await for fetch
      let keyForApi = ""; // Variable to hold the key to send to API (might be empty)
      try {
        console.log("Attempting to decode secret key from uploaded image...");
        const decodedData = decodeImage(image); // Call the decoder

        if (decodedData === null) {
          // Decoding failed - Log it, but DON'T set UI error. Let verification fail naturally.
          console.error(
            "Failed to decode Secret Key from image. Proceeding with empty key."
          );
          // keyForApi remains ""
          setSecretKey(""); // Ensure state reflects decoding failure for details panel
        } else {
          // Decoding successful - store the key
          console.log(`Secret Key decoded: ${decodedData.substring(0, 5)}...`);
          keyForApi = decodedData; // Use the decoded key for the API call
          setSecretKey(decodedData); // Set state for display in details panel later
        }

        // 3. Parse Product QR Data (regardless of key decoding success/failure)
        let parsedProductQR: ProductQRData;
        try {
          parsedProductQR = JSON.parse(productQRString);
          if (
            typeof parsedProductQR.encrypted !== "string" ||
            typeof parsedProductQR.signature !== "string"
          ) {
            throw new Error(
              "Parsed Product QR data does not have the expected format."
            );
          }
        } catch (parseError) {
          // Still show parsing errors for the Product QR, as it's a separate input issue
          setError(
            "Invalid Product QR data format. Please ensure it contains the correct JSON structure."
          );
          console.error("Product QR JSON parsing error:", parseError);
          setIsVerifying(false);
          return; // Stop if Product QR is invalid
        }

        // 4. Call the Verification API (with potentially empty key if decode failed)
        try {
          console.log(
            `Calling API with key: ${
              keyForApi ? keyForApi.substring(0, 5) + "..." : "EMPTY_KEY"
            }`
          );
          const res = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productQR: parsedProductQR,
              secretKey: keyForApi, // Use the decoded key OR empty string
            }),
          });
          const apiResult = await res.json();
          if (res.ok) {
            // Display success result from API
            setResult(
              apiResult.message ||
                "Verification successful, but no message received."
            );
            if (apiResult.details)
              console.log("Decrypted Details:", apiResult.details);
          } else {
            // Display failure result from API (this will catch the "TAMPERED/FAKE" message)
            // Don't overwrite with a generic message if API provides one
            setResult(
              apiResult.message || apiResult.error || "Verification failed."
            ); // Show API message/error as result
            setError(""); // Clear general error if API provided a result message
          }
        } catch (networkError: any) {
          // Handle network errors separately
          console.error("Verification network error:", networkError);
          setError(
            `Network error during verification: ${
              networkError.message || String(networkError)
            }`
          );
          setResult(""); // Clear result on network error
        } finally {
          setIsVerifying(false); // Stop loading indicator after API call
        }
      } catch (generalError: any) {
        // Catch any unexpected errors during the process after image load
        console.error("Error during verification process:", generalError);
        setError(
          `An unexpected error occurred: ${
            generalError.message || String(generalError)
          }`
        );
        setIsVerifying(false);
      }
    }; // end of image.onload

    image.onerror = () => {
      // Handle error if the image Data URL itself is somehow invalid
      console.error(
        "Failed to load image element from uploaded Data URL for decoding."
      );
      // Show this error as it prevents decoding attempt
      setError("Failed to process the uploaded Secret Key image.");
      setIsVerifying(false);
    };

    // Set the source to trigger the image loading and the decoding logic in onload
    image.src = uploadedSecretImageSrc;
  }; // end of handleVerify

  // Handles data received from the QRScanner component (only for Product QR)
  const handleScan = (data: string) => {
    if (scanMode === "product") {
      setProductQRString(data); // Update state with scanned data
      setError(""); // Clear any previous errors
      setResult(""); // Clear previous result
    }
    setScanMode(null); // Close the scanner UI
  };

  // Handles image uploads
  const handleUpload = (
    e: ChangeEvent<HTMLInputElement>,
    type: "product" | "secret" // Distinguish between the two upload types
  ) => {
    // Ensure a file was selected
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader(); // Create a FileReader to read the file

    // Clear previous results and errors
    setError("");
    setResult("");

    if (type === "product") {
      setProductQRString(""); // Clear previous Product QR data
    } else {
      setSecretKey(""); // Clear previous Secret Key
      setUploadedSecretImageSrc(null); // Clear previous secret image source
    }

    // Define what happens when the file is successfully read
    reader.onload = (loadEvent) => {
      // Ensure reading was successful
      if (!loadEvent.target?.result) {
        setError("Failed to read file content.");
        return;
      }
      const imageSrc = loadEvent.target.result as string; // Get the image Data URL

      // --- Handle Product QR Image Upload ---
      if (type === "product") {
        const image = new Image(); // Create an Image element to process
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setError("Failed to get canvas context for Product QR decoding.");
            return;
          }
          ctx.drawImage(image, 0, 0, image.width, image.height);
          try {
            const imageData = ctx.getImageData(0, 0, image.width, image.height);
            const code = jsQR(imageData.data, image.width, image.height, {
              inversionAttempts: "dontInvert",
            });
            if (code && code.data) {
              setProductQRString(code.data); // Set the raw JSON string
              console.log("Product QR decoded from image:", code.data);
            } else {
              // Set error if QR not detected in Product image
              setError("No QR code detected in the uploaded Product image.");
            }
          } catch (qrError: any) {
            console.error("jsQR Error:", qrError);
            setError(
              `Error decoding Product QR from image: ${
                qrError.message || String(qrError)
              }`
            );
          }
        };
        image.onerror = () => {
          setError("Failed to load the uploaded Product QR image file.");
        };
        image.src = imageSrc; // Set src to load the image
      }
      // --- Handle Secret Key Image Upload ---
      else if (type === "secret") {
        // Just store the image source, DO NOT decode here
        setUploadedSecretImageSrc(imageSrc);
        console.log("Secret Key Image uploaded and stored.");
        // Optionally show a preview here if needed
      }
    }; // end of reader.onload

    // Define what happens if the FileReader itself fails
    reader.onerror = () => {
      setError("Error reading the uploaded file.");
    };

    // Start reading the selected file as a Data URL
    reader.readAsDataURL(file);
    // Clear the file input value to allow re-uploading the same file if needed
    e.target.value = "";
  };

  // --- Render Component ---
  return (
    <div className="max-w-3xl mx-auto p-6 font-sans">
      {/* Back Link */}
      <div className="mb-4">
        <Link
          href="/"
          className="text-blue-600 font-bold hover:underline transition"
        >
          &larr; Back to Home
        </Link>
      </div>
      {/* Title */}
      <h2 className="text-3xl font-bold text-gray-800 mb-6">
        Verify Product Authenticity
      </h2>

      {/* Step 1: Product QR Input Section */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-700 mb-3">
          Step 1: Provide Product QR Data
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Scan Button */}
          <div>
            <button
              onClick={() => setScanMode("product")}
              className="w-full bg-gray-700 text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition mb-2"
            >
              Scan Product QR with Camera
            </button>
            <p className="text-xs text-center text-gray-500">OR</p>
          </div>
          {/* Upload Button */}
          <div>
            <label
              htmlFor="product-upload"
              className="w-full cursor-pointer inline-block text-center bg-gray-700 text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
            >
              Upload Product QR Image
            </label>
            <input
              id="product-upload"
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e, "product")}
              className="hidden"
            />
          </div>
        </div>
        <textarea
          placeholder="Scan or upload Product QR. Data (JSON format) will appear here..."
          value={productQRString}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setProductQRString(e.target.value)
          }
          className="mt-4 border border-gray-300 p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-black font-mono text-sm"
          rows={4}
        />
      </div>

      {/* Active Scanner Display Area */}
      {scanMode === "product" && (
        <div className="mb-6 bg-white p-4 rounded-lg shadow-md border border-blue-300">
          <h3 className="text-lg font-semibold text-gray-700 mb-2 text-center">
            Scanning Product QR...
          </h3>
          <QRScanner label="Point Camera at Product QR" onScan={handleScan} />
          <div className="mt-2 flex justify-center">
            <button
              onClick={() => setScanMode(null)}
              className="bg-red-600 text-white font-semibold px-4 py-1 rounded shadow hover:bg-red-700 transition text-sm"
            >
              Cancel Scan
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Secret Key Image Upload Section */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="font-semibold text-gray-700 mb-3 text-xl">
          Step 2: Upload Secret Key Image
        </h3>
        <label
          htmlFor="secret-upload"
          className={`w-full cursor-pointer inline-block text-center bg-gray-700 text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition`}
        >
          Select Secret Key Image File
        </label>
        <input
          id="secret-upload"
          type="file"
          accept="image/png, image/jpeg, image/bmp"
          onChange={(e) => handleUpload(e, "secret")}
          className="hidden"
        />
        {/* Show confirmation message */}
        {uploadedSecretImageSrc && (
          <div className="mt-3 text-center">
            <p className="text-sm text-green-700 bg-green-100 p-2 rounded border border-green-300 inline-block">
              Secret Key Image selected. Ready for verification.
            </p>
            {/* Optional Preview:
                 <img src={uploadedSecretImageSrc} alt="Secret key image preview" className="max-w-xs max-h-32 mx-auto mt-2 border rounded" />
                 */}
          </div>
        )}
        {!uploadedSecretImageSrc && (
          <p className="mt-3 text-sm text-gray-500">
            Upload the image containing the hidden secret key.
          </p>
        )}
      </div>

      {/* Step 3: Verification Button */}
      <div className="mt-6 text-center">
        <button
          onClick={handleVerify}
          // Disable button if required inputs are missing or verification is in progress
          disabled={!productQRString || !uploadedSecretImageSrc || isVerifying}
          className="w-full md:w-auto bg-green-600 text-white font-bold px-8 py-3 rounded-lg shadow-lg hover:bg-green-700 transition text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isVerifying ? "Verifying..." : "Verify Authenticity"}
        </button>
      </div>

      {/* Display Verification Result OR Error Messages */}
      {/* Display Result (Success or API Failure Message) */}
      {result && (
        <p
          className={`mt-6 text-2xl text-center font-bold p-4 rounded border ${
            result.includes("✅") || result.toLowerCase().includes("authentic")
              ? "bg-green-100 border-green-300 text-green-700"
              : "bg-red-100 border-red-400 text-red-700" // Treat API failure message as result
          }`}
        >
          {result}
        </p>
      )}
      {/* Display General/Network Errors (if no result message from API) */}
      {error && !result && (
        <p className="mt-6 text-lg text-center text-red-700 font-bold bg-red-100 p-4 rounded border border-red-400">
          {error}
        </p>
      )}

      {/* Verification Details Panel */}
      {/* Show only if verification was attempted (inputs were present) and not currently verifying */}
      {productQRString && uploadedSecretImageSrc && !isVerifying && (
        <div className="mt-8 bg-gray-100 p-6 rounded-lg shadow overflow-x-auto">
          <h3 className="text-xl font-bold mb-4 text-gray-800">
            Verification Details (after attempt)
          </h3>
          {(() => {
            let parsedData: ProductQRData | null = null;
            let parseError = null;
            // Try parsing only if productQRString is not empty
            if (productQRString) {
              try {
                parsedData = JSON.parse(productQRString);
              } catch (e) {
                parseError = e;
              }
            }

            return (
              <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="font-semibold text-gray-700">
                    Product QR Data (Raw)
                  </dt>
                  <dd className="text-gray-800 break-all">
                    {productQRString || "N/A"}
                  </dd>
                </div>
                {parseError ? (
                  <div className="sm:col-span-2 text-red-600">
                    <dt className="font-semibold">Product QR Parsing Error</dt>
                    <dd>{String(parseError)}</dd>
                  </div>
                ) : null}
                {parsedData && !parseError && (
                  <>
                    <div>
                      <dt className="font-semibold text-gray-700">
                        Extracted Salt (Hex)
                      </dt>
                      <dd className="text-gray-800 break-all">
                        {parsedData.encrypted?.split(".")[0] || "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-gray-700">
                        Encrypted Cipher (Hex)
                      </dt>
                      <dd className="text-gray-800 break-all">
                        {parsedData.encrypted?.split(".")[1] || "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-gray-700">Signature</dt>
                      <dd className="text-gray-800 break-all">
                        {parsedData.signature || "N/A"}
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="font-semibold text-gray-700">
                    Secret Key Image Status
                  </dt>
                  <dd className="text-gray-800 break-all">
                    {uploadedSecretImageSrc ? "Uploaded" : "Not Uploaded"}
                  </dd>
                </div>
                {/* Display extracted key info only if verify was clicked (even if decode failed) */}
                {(secretKey !== "" ||
                  error.toLowerCase().includes("decode")) && ( // Show if key was set OR a decode error occurred
                  <div>
                    <dt className="font-semibold text-gray-700">
                      Secret Key (Decoded)
                    </dt>
                    <dd className="text-gray-800 break-all">
                      {secretKey
                        ? `${secretKey.substring(0, 5)}...`
                        : "(Decoding Failed)"}
                    </dd>
                  </div>
                )}
                {/* Display the final verification result or error */}
                {result && ( // Display result message (success or API failure)
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-gray-700">
                      Verification Result
                    </dt>
                    <dd
                      className={`font-bold ${
                        result.includes("✅") ||
                        result.toLowerCase().includes("authentic")
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {result}
                    </dd>
                  </div>
                )}
                {error &&
                  !result && ( // Display general error only if no result message
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-gray-700">
                        Verification Error
                      </dt>
                      <dd className="font-bold text-red-700">{error}</dd>
                    </div>
                  )}
              </dl>
            );
          })()}
        </div>
      )}
    </div>
  );
}

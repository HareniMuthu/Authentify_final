"use client";
import { useState, useRef, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
// Assuming this path and function signature are correct based on your project structure
// It's assumed encodeImage takes an HTMLImageElement and data string, returning a PNG Data URL string
import { encodeImage } from "../../../lib/steganography"; // Adjust path if needed

// Dynamically import react-qr-code to avoid SSR issues
import QRCode from "react-qr-code";

interface QRData {
  encrypted: string;
  signature: string;
  secretKey: string;
}

export default function GeneratePage() {
  // Form data state
  const [formData, setFormData] = useState({
    productName: "",
    sku: "",
    batch: "",
    manufactureDate: "",
    quantity: "",
    destinationShop: "",
    secretKey: "",
  });
  // State for API response
  const [qrData, setQrData] = useState<QRData | null>(null);
  // State for the user-uploaded cover image (Data URL)
  const [coverImageSrc, setCoverImageSrc] = useState<string | null>(null);
  // State for the final steganographic image holding the secret key (Data URL)
  const [stegoSecretImageUrl, setStegoSecretImageUrl] = useState<string | null>(
    null
  );
  // Loading and error states
  const [isLoading, setIsLoading] = useState(false); // Covers API call + stego encoding
  const [error, setError] = useState("");

  // Ref ONLY for Product QR Code SVG download
  const productQRRef = useRef<HTMLDivElement>(null);

  // Function to download QR Code as SVG (for Product QR)
  const downloadProductQrSVG = () => {
    if (!productQRRef.current) {
      setError("Cannot find Product QR Code element to download.");
      console.error("Download failed: Product QR Code element not found.");
      return;
    }
    const svg = productQRRef.current.querySelector("svg");
    if (!svg) {
      setError("Cannot find SVG within the Product QR Code element.");
      console.error(
        "Download failed: SVG element not found within the Product QR ref."
      );
      return;
    }
    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const blob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ProductQR.svg";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setError(""); // Clear error on successful download attempt
    } catch (err) {
      setError("Error occurred during Product QR SVG download process.");
      console.error("Product QR SVG download error:", err);
    }
  };

  // Function to download the steganographic secret image (PNG)
  const downloadStegoSecretImage = () => {
    if (!stegoSecretImageUrl) {
      setError("No secret image available to download.");
      console.error(
        "Download failed: Steganographic secret image URL is not set."
      );
      return;
    }
    try {
      const link = document.createElement("a");
      link.href = stegoSecretImageUrl; // This should be a Data URL from encodeImage
      link.download = "Secret_Key_Image.png"; // Suggest PNG format
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setError(""); // Clear error on successful download attempt
    } catch (err) {
      setError("Error occurred during secret image download process.");
      console.error("Secret image download error:", err);
    }
  };

  // Handle cover image upload by user
  const handleCoverImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(""); // Clear errors
    setCoverImageSrc(null); // Clear previous image preview
    setStegoSecretImageUrl(null); // Clear previous generated image
    setQrData(null); // Clear previous API results

    if (file) {
      // Validate file type (allow common image types, PNG preferred for LSB)
      if (!file.type.startsWith("image/")) {
        setError("Please upload a valid image file (PNG, JPG, BMP, etc.).");
        e.target.value = ""; // Clear the file input
        return;
      }
      // Optional: Validate file size (e.g., max 5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(`Image file too large (max ${maxSize / 1024 / 1024}MB).`);
        e.target.value = ""; // Clear the file input
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        setCoverImageSrc(loadEvent.target?.result as string);
        console.log("Cover image uploaded and ready.");
      };
      reader.onerror = () => {
        setError("Failed to read the uploaded image file.");
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle form field changes
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    // Clear results if form changes after generation
    setQrData(null);
    setStegoSecretImageUrl(null);
    // Don't clear coverImageSrc here, user might want to reuse it
  };

  // Handle form submission (API call + Steganography for Secret Key)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setQrData(null); // Clear previous API data
    setStegoSecretImageUrl(null); // Clear previous stego image

    // 1. Check if cover image has been uploaded by the user
    if (!coverImageSrc) {
      setError("Please upload a cover image before generating.");
      return;
    }

    setIsLoading(true); // Start loading indicator

    try {
      // 2. Fetch encrypted data and signature from API
      // This now includes the backend "mining" time if PoW was added
      console.log(
        "Calling /api/generate (may take time due to backend mining)..."
      );
      const startTime = Date.now();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const endTime = Date.now();
      console.log(`/api/generate call took ${endTime - startTime}ms`);

      const data: QRData | { error: string } = await res.json();

      // Check API response first
      if (
        !res.ok ||
        !data ||
        ("error" in data && data.error) ||
        !("encrypted" in data)
      ) {
        const apiError =
          data && "error" in data
            ? data.error
            : `API Error: ${res.status} ${res.statusText}`;
        setError(apiError || "Error generating codes from API");
        setIsLoading(false);
        return;
      }

      // API call successful, proceed with steganography
      setQrData(data); // Store data (needed for Product QR and original Secret QR display)

      // 3. Perform Steganography for the Secret Key using the uploaded image
      if (data.secretKey) {
        // Create an HTMLImageElement from the uploaded image's Data URL
        // because encodeImage is assumed to take an HTMLImageElement
        const coverImageElement = new Image();
        coverImageElement.onload = () => {
          // Image is loaded, now perform encoding
          try {
            console.log(
              `Attempting to encode secret key: ${data.secretKey.substring(
                0,
                5
              )}... into uploaded cover image.`
            );
            // Pass the loaded image element and the secret key
            const newImageDataUrl = encodeImage(
              coverImageElement,
              data.secretKey
            );

            // Validate the output from encodeImage
            if (
              typeof newImageDataUrl !== "string" ||
              !newImageDataUrl.startsWith("data:image/") // Check if it's a data URL
            ) {
              console.error(
                "encodeImage did not return a valid Data URL string.",
                newImageDataUrl
              );
              // Throw error to be caught below
              throw new Error(
                "Steganography function failed to return expected image format."
              );
            }

            setStegoSecretImageUrl(newImageDataUrl); // Set state with the new image URL
            console.log("Secret key encoded into image successfully.");
            // Stop loading indicator *after* successful stego encoding
            setIsLoading(false);
          } catch (stegoError: any) {
            console.error(
              "Steganography encoding error for secret key:",
              stegoError
            );
            setError(
              `Failed to encode secret key into image: ${
                stegoError.message || String(stegoError)
              }`
            );
            setStegoSecretImageUrl(null); // Ensure image is cleared on error
            setIsLoading(false); // Stop loading on error
          }
        }; // end of onload
        coverImageElement.onerror = () => {
          // Handle error if the Data URL itself is somehow invalid
          console.error(
            "Failed to load image element from uploaded Data URL for encoding."
          );
          setError("Failed to process the uploaded cover image for encoding.");
          setIsLoading(false);
        };
        // Set the source of the image element to the Data URL from state
        coverImageElement.src = coverImageSrc;
        // Note: setIsLoading(false) is now inside onload/onerror callbacks
      } else {
        // This case should ideally not happen if API validation is correct
        setError(
          "API response missing secret key, cannot generate secret image."
        );
        setIsLoading(false);
      }
    } catch (err: any) {
      // Catch network errors or other unexpected issues during fetch/initial processing
      console.error("Form submission or fetch error:", err);
      setError(`Network or processing error: ${err.message || String(err)}`);
      setIsLoading(false);
    }
    // Note: isLoading might still be true here if encoding is happening asynchronously in the Image onload.
  };

  // --- Render ---
  return (
    <div className="max-w-4xl mx-auto p-6 font-sans">
      {" "}
      {/* Increased max-width */}
      {/* Back Link */}
      <div className="mb-4">
        <Link
          href="/"
          className="text-blue-600 font-bold hover:underline transition"
        >
          &larr; Back to Home
        </Link>
      </div>
      {/* Page Title */}
      <h2 className="text-3xl font-bold text-gray-800 mb-6">
        Generate Product Authentication Output
      </h2>
      {/* Step 1: Upload Cover Image */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-700 mb-3">
          Step 1: Upload Cover Image for Secret Key (PNG Recommended)
        </h3>
        <input
          type="file"
          accept="image/png, image/jpeg, image/bmp" // Accept common types, prioritize PNG
          onChange={handleCoverImageUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-700 cursor-pointer"
        />
        {coverImageSrc && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-600 mb-2">
              Cover Image Preview:
            </p>
            <img
              src={coverImageSrc}
              alt="Uploaded cover"
              className="max-w-xs max-h-48 border border-gray-300 rounded"
            />
          </div>
        )}
      </div>
      {/* Step 2: Product Details Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white p-6 rounded-lg shadow-md border border-gray-200"
      >
        <h3 className="text-xl font-semibold text-gray-700 mb-1">
          Step 2: Enter Product Details & Generate
        </h3>
        {/* Form Inputs */}
        {[
          { label: "Product Name / Type", name: "productName", type: "text" },
          { label: "SKU / Serial Number", name: "sku", type: "text" },
          { label: "Batch ID", name: "batch", type: "text" },
          {
            label: "Date of Manufacture",
            name: "manufactureDate",
            type: "date",
          },
          { label: "Quantity / Units", name: "quantity", type: "number" },
          {
            label: "Destination Shop ID",
            name: "destinationShop",
            type: "text",
          },
          { label: "Secret Key", name: "secretKey", type: "password" }, // Use password type
        ].map(({ label, name, type }) => (
          <div key={name} className="flex flex-col">
            <label htmlFor={name} className="mb-1 font-semibold text-gray-700">
              {label}:
            </label>
            <input
              id={name} // Added id for label association
              type={type}
              name={name}
              value={formData[name as keyof typeof formData]}
              onChange={handleChange}
              className="border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-black"
              required
            />
          </div>
        ))}
        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !coverImageSrc} // Disable if loading or no cover image uploaded
          className="w-full bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {/* Show different text while loading */}
          {isLoading
            ? "Generating (mining block...)"
            : "Generate Product QR & Secret Image"}
        </button>
        {!coverImageSrc && (
          <p className="text-xs text-red-600 mt-1">
            Please upload a cover image first (Step 1).
          </p>
        )}
      </form>
      {/* Display Error if any */}
      {error && (
        <p className="text-red-600 mt-4 font-medium bg-red-100 p-3 rounded border border-red-400">
          {error}
        </p>
      )}
      {/* Step 3: Results Section */}
      {/* Show only after successful API call */}
      {qrData && ( // Keep showing results section even if stego fails, to show Product QR
        <div className="mt-8 bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-2xl font-bold text-gray-800 mb-4">
            Step 3: Generated Output
          </h3>
          {/* Use grid for better layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Column 1: Product QR Code Block (Standard QR) */}
            <div className="flex flex-col items-center text-center">
              <p className="font-semibold text-gray-700 mb-2">📦 Product QR</p>
              <div
                ref={productQRRef}
                className="p-2 border border-gray-300 rounded bg-white"
              >
                <QRCode
                  value={JSON.stringify({
                    encrypted: qrData.encrypted,
                    signature: qrData.signature,
                  })}
                  size={160}
                  level="L"
                />
              </div>
              <button
                onClick={downloadProductQrSVG}
                className="mt-3 bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow hover:bg-blue-700 transition text-sm"
              >
                Download Product QR (SVG)
              </button>
              <p className="mt-1 text-xs text-gray-600">
                Attach this QR to the product.
              </p>
            </div>

            {/* Column 2: Original Secret Key QR Code Block */}
            <div className="flex flex-col items-center text-center">
              <p className="font-semibold text-gray-700 mb-2">
                🔑 Original Secret Key QR
              </p>
              <div
                // ref={secretQRRef} // Add ref if download needed later
                className="p-2 border border-gray-300 rounded bg-white"
              >
                {qrData.secretKey ? (
                  <QRCode value={qrData.secretKey} size={160} level="L" />
                ) : (
                  <div className="w-40 h-40 flex items-center justify-center border border-dashed">
                    <p className="text-red-500 text-sm">Missing Key</p>
                  </div>
                )}
              </div>
              {/* No download button here as requested */}
              <p className="mt-1 text-xs text-gray-600">(For reference only)</p>
            </div>

            {/* Column 3: Secret Key Steganographic Image Block */}
            <div className="flex flex-col items-center text-center">
              <p className="font-semibold text-gray-700 mb-2">
                🖼️ Final Secret Key Image
              </p>
              <div className="p-1 border border-gray-300 rounded bg-gray-100 w-[168px] h-[168px] flex items-center justify-center">
                {/* Show loading state specifically for stego encoding */}
                {isLoading && !stegoSecretImageUrl && (
                  <p className="text-gray-500 text-sm px-2">
                    Encoding Image...
                  </p>
                )}
                {/* Show the generated image if available and not loading */}
                {!isLoading && stegoSecretImageUrl && (
                  <img
                    src={stegoSecretImageUrl}
                    alt="Secret Key hidden in uploaded image"
                    className="max-w-full max-h-full object-contain"
                  />
                )}
                {/* Show placeholder if not loading and stego failed/not done yet */}
                {!isLoading && !stegoSecretImageUrl && qrData && (
                  <div className="w-full h-full flex items-center justify-center border border-dashed">
                    <p className="text-gray-500 text-sm px-2">
                      Secret Image will appear here (or encoding failed)
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={downloadStegoSecretImage}
                disabled={!stegoSecretImageUrl || isLoading} // Disable if image isn't generated or still loading
                className="mt-3 bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow hover:bg-blue-700 transition text-sm disabled:opacity-50"
              >
                Download Secret Image (PNG)
              </button>
              <p className="mt-1 text-xs text-gray-600">
                Send this image securely.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Technical Details Panel (Optional) */}
      {qrData && !isLoading && (
        <div className="mt-8 bg-gray-100 p-6 rounded-lg shadow overflow-x-auto">
          {/* ... Technical details can remain similar ... */}
          <h3 className="text-xl font-bold mb-4 text-gray-800">
            Technical Details (for reference)
          </h3>
          <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 text-sm">
            <div>
              <dt className="font-semibold text-gray-700">
                Input Data (Sent to API)
              </dt>
              <dd className="text-gray-800 whitespace-pre-wrap break-all">
                {JSON.stringify(
                  { ...formData, secretKey: "********" }, // Mask secret key
                  null,
                  2
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">Salt (Hex)</dt>
              <dd className="text-gray-800 break-all">
                {qrData.encrypted.split(".")[0] || "N/A"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">Signature</dt>
              <dd className="text-gray-800 break-all">{qrData.signature}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-gray-700">
                Data in Product QR (JSON Format)
              </dt>
              <dd className="text-gray-800 break-all">
                {JSON.stringify({
                  encrypted: qrData.encrypted,
                  signature: qrData.signature,
                })}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-gray-700">
                Data Hidden in Secret Image
              </dt>
              <dd className="text-gray-800 break-all">{qrData.secretKey}</dd>
            </div>
            {/* Optionally display backend processing time if needed */}
            {/* <div><dt>Backend Processing Time</dt><dd>{endTime - startTime} ms</dd></div> */}
          </dl>
        </div>
      )}
    </div>
  );
}

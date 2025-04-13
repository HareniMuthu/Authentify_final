"use client";
import { useState, ChangeEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import QRScanner from "@/app/components/QRScanner";
import jsQR from "jsqr";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

interface ProductQRData {
  encrypted: string;
  signature: string;
}

export default function VerifyPage() {
  const [productQR, setProductQR] = useState("");
  const [secretKeyQR, setSecretKeyQR] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  // scanMode: "product", "secret", or null (none)
  const [scanMode, setScanMode] = useState<"product" | "secret" | null>(null);

  const handleVerify = async () => {
    setError("");
    setResult("");
    if (!productQR || !secretKeyQR) {
      setError("Both QR codes must be scanned or entered.");
      return;
    }
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productQR: JSON.parse(productQR) as ProductQRData,
          secretKey: secretKeyQR,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.message);
      } else {
        setError(data.error || "Verification failed");
      }
    } catch {
      setError("Network error during verification.");
    }
  };

  const handleScan = (data: string) => {
    if (scanMode === "product") {
      setProductQR(data);
    } else if (scanMode === "secret") {
      setSecretKeyQR(data);
    }
    setScanMode(null);
  };

  // File upload handler: decodes the selected image via an off-screen canvas.
  const handleUpload = (
    e: ChangeEvent<HTMLInputElement>,
    type: "product" | "secret"
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(image, 0, 0, image.width, image.height);
          const imageData = ctx.getImageData(0, 0, image.width, image.height);
          const code = jsQR(imageData.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });
          if (code && code.data) {
            if (type === "product") {
              setProductQR(code.data);
            } else {
              setSecretKeyQR(code.data);
            }
          } else {
            alert("No QR code detected in the image.");
          }
        }
      };
      image.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  let superimposedQR = null;
  if (productQR && secretKeyQR) {
    try {
      const prodData = JSON.parse(productQR) as ProductQRData;
      superimposedQR = (
        <div className="relative w-64 h-64 mx-auto border border-gray-300 rounded shadow-md">
          {/* Base QR (Product Encrypted Data) */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: 0.7 }}
          >
            <QRCode value={prodData.encrypted} />
          </div>
          {/* Overlaid QR (Secret Key) */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ opacity: 0.7 }}
          >
            <QRCode value={secretKeyQR} />
          </div>
        </div>
      );
    } catch {
      superimposedQR = (
        <p className="text-sm text-red-600">Error parsing Product QR data.</p>
      );
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4">
        <Link
          href="/"
          className="text-blue-600 font-bold hover:underline transition"
        >
          &larr; Back to Home
        </Link>
      </div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6">
        Verify Product Authenticity
      </h2>

      {/* Scanning Mode Buttons */}
      <div className="flex justify-center gap-4">
        <button
          onClick={() => setScanMode("product")}
          className="bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
        >
          Scan Product QR
        </button>
        <button
          onClick={() => setScanMode("secret")}
          className="bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
        >
          Scan Secret Key QR
        </button>
      </div>

      {/* Active Scanner */}
      {scanMode && (
        <div className="mt-4">
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            {scanMode === "product"
              ? "Scanning Product QR"
              : "Scanning Secret Key QR"}
          </h3>
          <QRScanner
            label={scanMode === "product" ? "Product QR" : "Secret Key QR"}
            onScan={handleScan}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setScanMode(null)}
              className="bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
            >
              Cancel Scanning
            </button>
          </div>
        </div>
      )}

      {/* Manual Input and Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Product QR Input */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h3 className="font-semibold text-gray-700 mb-2">
            Product QR Data (Manual or Scanned)
          </h3>
          <textarea
            placeholder="Paste Product QR data here"
            value={productQR}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setProductQR(e.target.value)
            }
            className="mt-2 border border-gray-300 p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-black"
            rows={3}
          />
          {/* Styled Upload Button */}
          <div className="mt-2">
            <label
              htmlFor="product-upload"
              className="cursor-pointer inline-block bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
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
        {/* Secret QR Input */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h3 className="font-semibold text-gray-700 mb-2">
            Secret Key (Manual or Scanned)
          </h3>
          <input
            type="text"
            placeholder="Paste Secret Key here"
            value={secretKeyQR}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setSecretKeyQR(e.target.value)
            }
            className="mt-2 border border-gray-300 p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-black"
          />
          {/* Styled Upload Button */}
          <div className="mt-2">
            <label
              htmlFor="secret-upload"
              className="cursor-pointer inline-block bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
            >
              Upload Secret QR Image
            </label>
            <input
              id="secret-upload"
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e, "secret")}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Superimposed QR Code Display */}
      {productQR && secretKeyQR && (
        <div className="mt-8">
          <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">
            Superimposed QR Code
          </h3>
          {superimposedQR}
        </div>
      )}

      {/* Verification Button */}
      <div className="mt-6">
        <button
          onClick={handleVerify}
          className="w-full md:w-auto bg-black text-white font-semibold px-6 py-3 rounded shadow hover:bg-gray-800 transition"
        >
          Verify Authenticity
        </button>
      </div>

      {result && <p className="mt-4 text-green-600 font-bold">{result}</p>}
      {error && <p className="mt-4 text-red-600 font-bold">{error}</p>}

      {/* Decryption Details Panel */}
      {productQR && secretKeyQR && (
        <div className="mt-8 bg-gray-100 p-6 rounded-lg shadow overflow-x-auto">
          <h3 className="text-xl font-bold mb-4 text-gray-800">
            Decryption Details
          </h3>
          {(() => {
            try {
              const prodData = JSON.parse(productQR) as ProductQRData;
              return (
                <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-gray-700">
                      Extracted Salt (Hex)
                    </dt>
                    <dd className="text-sm text-gray-800">
                      {prodData.encrypted.split(".")[0]}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-700">
                      Encrypted Cipher (Hex)
                    </dt>
                    <dd className="text-sm text-gray-800">
                      {prodData.encrypted.split(".")[1]}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-700">Signature</dt>
                    <dd className="text-sm text-gray-800">
                      {prodData.signature}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-700">
                      Provided Secret Key
                    </dt>
                    <dd className="text-sm text-gray-800">{secretKeyQR}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-gray-700">
                      Algorithm (Decryption) Details
                    </dt>
                    <dd className="text-sm text-gray-800">
                      • <span className="font-medium">Key Derivation:</span>{" "}
                      Uses SHA-256 hash of (secretKey + salt) to generate the
                      key stream.
                      <br />•{" "}
                      <span className="font-medium">Decryption Rounds:</span> 4
                      rounds reversing encryption:
                      <br />
                      &nbsp;&nbsp;&bull; Reverse nibble swap, right rotate by 1
                      bit, and XOR with key byte.
                      <br />• The process reconstructs the original plaintext.
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-gray-700">
                      Verification Result
                    </dt>
                    <dd className="text-sm text-gray-800">
                      {result || "Awaiting verification..."}
                    </dd>
                  </div>
                </dl>
              );
            } catch {
              return (
                <p className="text-sm text-red-600">
                  Invalid Product QR format.
                </p>
              );
            }
          })()}
        </div>
      )}
    </div>
  );
}

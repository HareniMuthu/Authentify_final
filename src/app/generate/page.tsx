"use client";
import { useState, useRef, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

interface QRData {
  encrypted: string;
  signature: string;
  secretKey: string;
}

export default function GeneratePage() {
  const [formData, setFormData] = useState({
    productName: "",
    sku: "",
    batch: "",
    manufactureDate: "",
    quantity: "",
    destinationShop: "",
    secretKey: "",
  });
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [error, setError] = useState("");

  // Refs for capturing QR Code SVG elements for download
  const productQRRef = useRef<HTMLDivElement>(null);
  const secretQRRef = useRef<HTMLDivElement>(null);

  const downloadSVG = (element: HTMLElement | null, filename: string) => {
    if (!element) return;
    const svg = element.querySelector("svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setQrData(data);
      } else {
        setError(data.error || "Error generating QR codes");
      }
    } catch {
      setError("Network error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-4">
        <Link
          href="/"
          className="text-blue-600 font-bold hover:underline transition"
        >
          &larr; Back to Home
        </Link>
      </div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6">
        Generate Product Authentication QR Codes
      </h2>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white p-6 rounded-lg shadow-md"
      >
        {[
          { label: "Product Name / Type", name: "productName", type: "text" },
          { label: "SKU / Serial Number", name: "sku", type: "text" },
          { label: "Batch ID", name: "batch", type: "text" },
          {
            label: "Date of Manufacture",
            name: "manufactureDate",
            type: "date",
          },
          {
            label: "Quantity / Units per Package",
            name: "quantity",
            type: "number",
          },
          {
            label: "Destination Shop / Shop ID",
            name: "destinationShop",
            type: "text",
          },
          { label: "Secret Key", name: "secretKey", type: "text" },
        ].map(({ label, name, type }) => (
          <div key={name} className="flex flex-col">
            <label className="mb-1 font-semibold text-gray-700">{label}</label>
            <input
              type={type}
              name={name}
              value={formData[name as keyof typeof formData]}
              onChange={handleChange}
              className="border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-black"
              required
            />
          </div>
        ))}
        <button
          type="submit"
          className="w-full bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
        >
          Generate QR Codes
        </button>
      </form>
      {error && <p className="text-red-600 mt-4 font-medium">{error}</p>}
      {qrData && (
        <>
          <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              QR Codes Generated
            </h3>
            <div className="flex flex-col md:flex-row justify-around items-center space-y-6 md:space-y-0">
              {/* Product QR Code Block */}
              <div className="flex flex-col items-center">
                <p className="font-semibold text-gray-700 mb-2">
                  📦 Product QR
                </p>
                <div
                  ref={productQRRef}
                  className="p-4 border border-gray-300 rounded"
                >
                  <QRCode
                    value={JSON.stringify({
                      encrypted: qrData.encrypted,
                      signature: qrData.signature,
                    })}
                  />
                </div>
                <button
                  onClick={() =>
                    downloadSVG(productQRRef.current, "ProductQR.svg")
                  }
                  className="mt-2 bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
                >
                  Download Product QR
                </button>
                <p className="mt-2 text-sm text-gray-600 text-center">
                  Attach this QR to the product/package.
                </p>
              </div>
              {/* Secret Key QR Code Block */}
              <div className="flex flex-col items-center">
                <p className="font-semibold text-gray-700 mb-2">
                  🔐 Secret Key QR
                </p>
                <div
                  ref={secretQRRef}
                  className="p-4 border border-gray-300 rounded"
                >
                  <QRCode value={qrData.secretKey} />
                </div>
                <button
                  onClick={() =>
                    downloadSVG(secretQRRef.current, "SecretKeyQR.svg")
                  }
                  className="mt-2 bg-black text-white font-semibold px-4 py-2 rounded shadow hover:bg-gray-800 transition"
                >
                  Download Secret QR
                </button>
                <p className="mt-2 text-sm text-gray-600 text-center">
                  Send this securely to the destination shopkeeper.
                </p>
              </div>
            </div>
          </div>
          {/* Encryption Details Panel */}
          <div className="mt-8 bg-gray-100 p-6 rounded-lg shadow overflow-x-auto">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              Encryption Details
            </h3>
            <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-gray-700">Input Data</dt>
                <dd className="text-sm text-gray-800 whitespace-pre-wrap">
                  {JSON.stringify(formData, null, 2)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">Salt (Hex)</dt>
                <dd className="text-sm text-gray-800">
                  {qrData.encrypted.split(".")[0]}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">
                  Encrypted Value (Hex)
                </dt>
                <dd className="text-sm text-gray-800">
                  {qrData.encrypted.split(".")[1]}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">Signature</dt>
                <dd className="text-sm text-gray-800">{qrData.signature}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-semibold text-gray-700">
                  Algorithm Details
                </dt>
                <dd className="text-sm text-gray-800">
                  • <span className="font-medium">Salt Generation:</span> 8
                  random bytes.
                  <br />•{" "}
                  <span className="font-medium">
                    Key Stream Derivation:
                  </span>{" "}
                  SHA-256 hash of (secretKey + salt), repeated to match
                  plaintext length.
                  <br />•{" "}
                  <span className="font-medium">Encryption Rounds:</span> 4
                  rounds, each consisting of:
                  <br />
                  &nbsp;&nbsp;&bull; XOR with key byte
                  <br />
                  &nbsp;&nbsp;&bull; Left rotate the result by 1 bit
                  <br />
                  &nbsp;&nbsp;&bull; Nibble swap (swap upper and lower 4 bits)
                  <br />• <span className="font-medium">
                    Output Format:
                  </span>{" "}
                  <code>saltHex.encryptedHex</code>.<br />•{" "}
                  <span className="font-medium">Signature:</span> 8‑character
                  Base62 value generated from a weighted sum of cipher bytes
                  modified by the key stream.
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-6xl font-extrabold text-gray-900 mb-12 text-center">
        Anti-Counterfeit System
      </h1>
      <div className="flex space-x-8">
        <Link
          href="/generate"
          className="px-8 py-4 text-2xl font-semibold text-white bg-black rounded-lg shadow-lg hover:bg-gray-900 transition duration-300"
        >
          Generate QR Codes
        </Link>
        <Link
          href="/verify"
          className="px-8 py-4 text-2xl font-semibold text-white bg-black rounded-lg shadow-lg hover:bg-gray-900 transition duration-300"
        >
          Verify Product
        </Link>
      </div>
    </div>
  );
}

// src/app/api/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  advancedQHCDecrypt,
  advancedQDSVerifySignature,
} from "../../../../lib/cryptoUtils";
// Import the Prisma client instance
import prisma from "../../../../lib/db"; // Adjust path if needed

// API Route Handler for POST requests
export async function POST(request: NextRequest) {
  console.log("[API Verify] Received request");
  try {
    // Parse request body
    const { productQR, secretKey } = await request.json();

    // Basic input validation
    if (
      !productQR ||
      typeof productQR.encrypted !== "string" ||
      typeof productQR.signature !== "string"
    ) {
      console.error("[API Verify] Invalid productQR data format received.");
      return NextResponse.json(
        { error: "Invalid productQR data format received." },
        { status: 400 }
      );
    }
    if (typeof secretKey !== "string") {
      // Allow empty string from frontend if decode failed
      console.error("[API Verify] Invalid secretKey format.");
      return NextResponse.json(
        { error: "Invalid secretKey format." },
        { status: 400 }
      );
    }

    const { encrypted, signature } = productQR;

    // --- Step 1: Verify the cryptographic signature ---
    console.log("[API Verify] Verifying signature...");
    let isAuthentic = false;
    try {
      console.log(
        "[API Verify] Calling advancedQDSVerifySignature with key:",
        secretKey ? secretKey.substring(0, 5) + "..." : "EMPTY_KEY"
      );
      isAuthentic = advancedQDSVerifySignature(encrypted, signature, secretKey);
      console.log(
        `[API Verify] advancedQDSVerifySignature result: ${isAuthentic}`
      );
    } catch (verifyError: any) {
      console.error(
        "[API Verify] Error during advancedQDSVerifySignature:",
        verifyError
      );
      isAuthentic = false; // Treat errors as verification failure
    }

    if (!isAuthentic) {
      console.log("[API Verify] Signature verification failed.");
      return NextResponse.json({
        message: "❌ Product has been TAMPERED or is FAKE",
      });
    }

    // --- Step 2: Signature is Valid - Check Ledger Verification Status ---
    console.log(
      "[API Verify] Signature verification successful. Checking ledger status..."
    );

    let decryptedData: string | null = null; // To store decrypted data later
    let finalMessage = ""; // To store the final response message

    try {
      const saltFromProductQR = encrypted.split(".")[0];
      if (!saltFromProductQR) {
        console.warn(
          "[API Verify] Could not extract salt. Proceeding without ledger check."
        );
        // Decrypt data since signature was valid
        try {
          decryptedData = advancedQHCDecrypt(encrypted, secretKey);
        } catch (e) {
          console.error("Decryption failed:", e);
          decryptedData = "(Decryption Failed)";
        }
        finalMessage =
          "✅ Product is AUTHENTIC (Ledger check skipped: invalid salt)";
      } else {
        // Find the corresponding block in the ledger using the unique salt
        console.log(
          `[API Verify] Querying ledger for salt: ${saltFromProductQR}`
        );
        // Use Prisma to find the block based on the unique salt field
        const block = await prisma.blockchainLedger.findUnique({
          where: { encrypted_data_salt: saltFromProductQR }, // Use the unique index on salt
        });

        if (!block) {
          // Block not found - this might indicate an issue during generation or data mismatch
          console.warn(
            `[API Verify] Ledger check: No block found for salt ${saltFromProductQR}. Product might be authentic but not properly registered.`
          );
          try {
            decryptedData = advancedQHCDecrypt(encrypted, secretKey);
          } catch (e) {
            console.error("Decryption failed:", e);
            decryptedData = "(Decryption Failed)";
          }
          finalMessage = "✅ Product is AUTHENTIC (Ledger record not found)";
          // *** This is where the TypeScript error occurs if the client is outdated ***
        } else if (block.isVerified) {
          // Accessing the 'isVerified' property
          // Block found AND already verified
          console.warn(
            `[API Verify] Block ${block.id} for salt ${saltFromProductQR} has already been verified at ${block.verifiedAt}.`
          );
          try {
            decryptedData = advancedQHCDecrypt(encrypted, secretKey);
          } catch (e) {
            console.error("Decryption failed:", e);
            decryptedData = "(Decryption Failed)";
          }
          // Return a specific message indicating reuse
          const verifiedDateString = block.verifiedAt
            ? new Date(block.verifiedAt).toLocaleString()
            : "unknown date";
          finalMessage = `⚠️ Product is AUTHENTIC, but this code has ALREADY BEEN VERIFIED previously on ${verifiedDateString}.`;
        } else {
          // Block found AND NOT verified yet - This is the first successful verification
          console.log(
            `[API Verify] Block ${block.id} for salt ${saltFromProductQR} is being verified for the first time.`
          );
          // Mark the block as verified in the database
          try {
            // Update the specific block found using its ID
            await prisma.blockchainLedger.update({
              where: { id: block.id }, // Use the unique ID of the found block
              data: {
                isVerified: true, // Update the 'isVerified' field
                verifiedAt: new Date(), // Set timestamp of verification
              },
            });
            console.log(`[API Verify] Block ${block.id} marked as verified.`);
            // Decrypt data
            try {
              decryptedData = advancedQHCDecrypt(encrypted, secretKey);
            } catch (e) {
              console.error("Decryption failed:", e);
              decryptedData = "(Decryption Failed)";
            }
            finalMessage = "✅ Product is AUTHENTIC (Verified and recorded)";
          } catch (updateError: any) {
            // Catch potential update errors
            console.error(
              `[API Verify] Failed to update verification status for block ${block.id}:`,
              updateError
            );
            if (updateError.message?.includes("Unknown argument")) {
              // Check for the specific error again
              finalMessage =
                "✅ Product is AUTHENTIC (Ledger update failed: Client out of sync - try restarting server/regenerating client)";
            } else {
              finalMessage = "✅ Product is AUTHENTIC (Ledger update failed)";
            }
            // Decrypt data even if update fails
            try {
              decryptedData = advancedQHCDecrypt(encrypted, secretKey);
            } catch (e) {
              console.error("Decryption failed:", e);
              decryptedData = "(Decryption Failed)";
            }
          }
        }
      }
    } catch (ledgerError) {
      // Handle unexpected errors during the ledger check process
      console.error("[API Verify] Error during ledger check:", ledgerError);
      try {
        decryptedData = advancedQHCDecrypt(encrypted, secretKey);
      } catch (e) {
        console.error("Decryption failed:", e);
        decryptedData = "(Decryption Failed)";
      }
      finalMessage =
        "✅ Product is AUTHENTIC (Ledger check failed due to error)";
    }

    // --- Step 3: Return Final Response ---
    console.log("[API Verify] Sending final response to frontend.");
    return NextResponse.json({
      message: finalMessage,
      details: decryptedData, // Include decrypted data or status
    });
  } catch (error: unknown) {
    // Catch any unexpected errors in the main try block
    console.error("[API Verify] Error in route handler:", error);
    const message =
      error instanceof Error
        ? error.message
        : "An unknown error occurred during verification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// src/app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  advancedQHCEncrypt,
  advancedQDSGenerateSignature,
} from "../../../../lib/cryptoUtils";
// Import blockchain utility functions including the new mineBlock
import { hashProductDetails, mineBlock } from "../../../../lib/blockchainUtils"; // Adjust path if needed
// Import the Prisma client instance
import prisma from "../../../../lib/db"; // Adjust path if needed

// --- Configuration ---
const BLOCKCHAIN_DIFFICULTY = 3; // Number of leading zeros required for the block hash (e.g., 3 means hash must start with "000")
// Adjust difficulty based on desired generation time vs. security simulation

// API Route Handler for POST requests
export async function POST(request: NextRequest) {
  console.log("Received request for /api/generate");
  try {
    // Parse request body
    const {
      productName,
      sku,
      batch,
      manufactureDate,
      quantity,
      destinationShop,
      secretKey,
    } = await request.json();

    // --- Step 1: Generate Crypto Data (Encryption and Signature) ---
    const productDetails = {
      productName,
      sku,
      batch,
      manufactureDate,
      quantity,
      destinationShop,
    };
    const productDataString = JSON.stringify(productDetails); // Stringify for encryption
    const encrypted = advancedQHCEncrypt(productDataString, secretKey);
    const signature = advancedQDSGenerateSignature(encrypted, secretKey);
    console.log("Crypto data generated.");

    // --- Step 2: Prepare Data for Blockchain Block Mining ---
    const timestamp = Date.now();
    const productDetailsHash = hashProductDetails(productDetails); // Hash original details
    const encryptedDataSalt = encrypted.split(".")[0]; // Use salt as a link to the specific encrypted data
    if (!encryptedDataSalt) {
      // This should not happen if encryption works, but good to check
      throw new Error("Failed to extract salt from encrypted data.");
    }

    // --- Get Previous Block Hash using Prisma ---
    let previousBlockHash: string;
    try {
      // Find the most recent block added to the ledger
      console.log("[API Generate] Fetching last block hash from DB...");
      const lastBlock = await prisma.blockchainLedger.findFirst({
        orderBy: { createdAt: "desc" }, // Order by creation time to get the latest
        select: { current_block_hash: true },
      });
      // Use the hash of the last block, or the genesis hash if the chain is empty
      previousBlockHash = lastBlock
        ? lastBlock.current_block_hash
        : "0".repeat(64); // Genesis hash
      console.log(
        `[API Generate] Previous block hash fetched: ${previousBlockHash.substring(
          0,
          10
        )}...`
      );
    } catch (dbError) {
      console.error(
        "[API Generate] Database error fetching last block hash:",
        dbError
      );
      throw new Error("Could not retrieve previous block hash from database.");
    }

    // Assemble data needed for mining (excluding nonce, which will be found)
    const dataToMine = {
      timestamp,
      product_details_hash: productDetailsHash,
      encrypted_data_salt: encryptedDataSalt,
      signature: signature,
      previous_block_hash: previousBlockHash,
    };

    // --- Step 3: Mine the Block (Find Nonce and Valid Hash) ---
    // This step performs the Proof-of-Work simulation
    console.log("[API Generate] Starting block mining...");
    const { nonce, hash: currentBlockHash } = mineBlock(
      dataToMine,
      BLOCKCHAIN_DIFFICULTY
    );
    // mineBlock function logs its progress and result internally

    // --- Step 4: Assemble the Full Block Record and Add to Ledger using Prisma ---
    const newBlockData = {
      timestamp: BigInt(timestamp), // Convert timestamp to BigInt for Prisma schema
      product_details_hash: productDetailsHash,
      encrypted_data_salt: encryptedDataSalt, // This is the unique identifier for the item
      signature: signature,
      previous_block_hash: previousBlockHash,
      nonce: nonce, // Include the found nonce
      current_block_hash: currentBlockHash, // Include the valid hash meeting difficulty
      // required product info fields from schema
      productName,
      sku,
      batch,
      manufactureDate: manufactureDate,
      quantity,
      destinationShop,
      // isVerified and verifiedAt will use default values from schema (false, null)
    };

    try {
      // Save the newly mined block to the database using Prisma Client
      console.log(
        `[API Generate] Attempting to save block to DB with salt: ${encryptedDataSalt}`
      );
      const addedBlock = await prisma.blockchainLedger.create({
        data: newBlockData,
      });
      console.log(
        `[API Generate] Prisma create successful. Block ID: ${addedBlock.id}, Salt: ${addedBlock.encrypted_data_salt}`
      );

      // *** ADD CONFIRMATION QUERY ***
      // Immediately try to read the block back to confirm it was saved
      if (addedBlock.id) {
        console.log(
          `[API Generate] Confirming block save by querying ID: ${addedBlock.id}`
        );
        const confirmationBlock = await prisma.blockchainLedger.findUnique({
          where: { id: addedBlock.id },
        });
        if (confirmationBlock) {
          console.log(
            `[API Generate] CONFIRMED block with ID ${addedBlock.id} and salt ${confirmationBlock.encrypted_data_salt} exists in DB.`
          );
        } else {
          // If we can't find it immediately, something is wrong with the write or DB connection/consistency
          console.error(
            `[API Generate] CONFIRMATION FAILED! Block with ID ${addedBlock.id} not found immediately after creation.`
          );
          throw new Error(
            "Database confirmation check failed after block creation. Block might not have been saved."
          );
        }
      } else {
        // This case shouldn't happen if create doesn't throw, but good failsafe
        throw new Error(
          "Block creation seemed successful but did not return an ID."
        );
      }
      // *****************************
    } catch (dbError: any) {
      console.error(
        "[API Generate] Database error during block creation or confirmation:",
        dbError
      );
      // Handle potential unique constraint violations (e.g., duplicate salt or hash)
      // Prisma error code for unique constraint violation
      if (
        dbError.code === "P2002" ||
        (dbError.meta && dbError.meta.target?.includes("encrypted_data_salt"))
      ) {
        throw new Error(
          `Failed to save block: An item with the same salt (${encryptedDataSalt}) already exists in the ledger.`
        );
      } else if (
        dbError.code === "P2002" ||
        (dbError.meta && dbError.meta.target?.includes("current_block_hash"))
      ) {
        throw new Error(
          `Failed to save block: A block with the same hash already exists (hash collision?).`
        );
      }
      // Rethrow other DB errors
      throw new Error(
        `Failed to save the new block to the database: ${
          dbError.message || dbError
        }`
      );
    }

    // --- Step 5: Return Crypto Data to Frontend ---
    // The frontend only needs the original outputs for QR/Steganography
    console.log("[API Generate] Sending crypto data back to frontend.");
    return NextResponse.json({ encrypted, signature, secretKey });
  } catch (error: unknown) {
    // Log the detailed error on the server
    console.error("Error in /api/generate route:", error);
    // Determine error message for the client
    const message =
      error instanceof Error
        ? error.message
        : "An unknown error occurred during generation.";
    // Return a JSON error response with a 500 status code
    return NextResponse.json(
      { error: `Generation failed: ${message}` },
      { status: 500 }
    );
  }
}

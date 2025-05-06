// lib/blockchainUtils.ts
import crypto from "crypto";

// Interface for the data included in a block *before* hashing the block itself
// Added nonce for Proof-of-Work
interface BlockData {
  timestamp: number; // e.g., Date.now()
  product_details_hash: string;
  encrypted_data_salt: string;
  signature: string;
  previous_block_hash: string;
  nonce: number; // Added nonce
}

/**
 * Calculates the SHA-256 hash of a given string.
 * @param data The string data to hash.
 * @returns The SHA-256 hash as a hex string.
 */
export function calculateHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Creates a string representation of the block data for hashing.
 * Includes the nonce.
 * @param blockData The data contained within the block.
 * @returns A concatenated string of block data fields.
 */
function blockDataToString(blockData: BlockData): string {
  return (
    blockData.timestamp.toString() +
    blockData.product_details_hash +
    blockData.encrypted_data_salt +
    blockData.signature +
    blockData.previous_block_hash +
    blockData.nonce.toString() // Include nonce in the string
  );
}

/**
 * Calculates the hash for a block based on its contents, including the nonce.
 * @param blockData The data contained within the block (including nonce).
 * @returns The SHA-256 hash of the block's data as a hex string.
 */
export function calculateBlockHash(blockData: BlockData): string {
  const blockString = blockDataToString(blockData);
  return calculateHash(blockString);
}

/**
 * Simulates mining a block by finding a nonce that results in a hash
 * meeting the specified difficulty (leading zeros).
 * @param blockData The block data (timestamp, details hash, salt, signature, prev hash) - nonce will be added/modified.
 * @param difficulty The number of leading zeros required in the hash.
 * @returns An object containing the found nonce and the valid hash.
 */
export function mineBlock(
  blockData: Omit<BlockData, "nonce" | "current_block_hash">,
  difficulty: number
): { nonce: number; hash: string } {
  let nonce = 0;
  let hash = "";
  const targetPrefix = "0".repeat(difficulty);
  console.log(
    `Mining block with difficulty ${difficulty} (target prefix: ${targetPrefix})...`
  );

  const startTime = Date.now();
  // Loop until a valid hash is found
  while (true) {
    const currentBlockAttempt: BlockData = { ...blockData, nonce }; // Add current nonce
    hash = calculateBlockHash(currentBlockAttempt); // Calculate hash with this nonce

    if (hash.startsWith(targetPrefix)) {
      // Found a valid hash!
      const endTime = Date.now();
      console.log(
        `Block mined successfully! Nonce: ${nonce}, Hash: ${hash} (took ${
          endTime - startTime
        }ms)`
      );
      return { nonce, hash };
    }
    nonce++; // Increment nonce and try again

    // Optional: Add a check to prevent infinite loops in case of issues
    if (nonce % 100000 === 0) {
      // Log progress every 100k attempts
      console.log(`Mining attempt #${nonce}... current hash: ${hash}`);
    }
    if (nonce > 10000000) {
      // Safety break after 10 million attempts
      console.error(
        "Mining aborted after 10 million attempts. Check difficulty or logic."
      );
      throw new Error("Mining difficulty likely too high or error in logic.");
    }
  }
}

/**
 * Creates a hash of the core product details.
 * @param details An object containing the product details.
 * @returns The SHA-256 hash of the stringified details.
 */
export function hashProductDetails(details: {
  productName: string;
  sku: string;
  batch: string;
  manufactureDate: string; // Consider standardizing date format first
  quantity: string | number;
  destinationShop: string;
}): string {
  // Stringify consistently, perhaps sorting keys for deterministic output
  const detailsString = JSON.stringify(details, Object.keys(details).sort());
  return calculateHash(detailsString);
}

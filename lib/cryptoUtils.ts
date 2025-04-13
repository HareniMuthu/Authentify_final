// lib/cryptoUtils.ts
import crypto from "crypto";

function generateSalt(): Buffer {
  return crypto.randomBytes(8); // 8-byte salt
}

function generateKeyStream(
  secretKey: string,
  salt: Buffer,
  length: number
): Buffer {
  // Derive a key stream from secret key + salt using a SHA-256 hash.
  const keyHash = crypto
    .createHash("sha256")
    .update(secretKey + salt.toString("hex"))
    .digest();
  const keyStream = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    keyStream[i] = keyHash[i % keyHash.length];
  }
  return keyStream;
}

function rotateLeft(byte: number, bits: number): number {
  return ((byte << bits) | (byte >> (8 - bits))) & 0xff;
}

function rotateRight(byte: number, bits: number): number {
  return ((byte >> bits) | (byte << (8 - bits))) & 0xff;
}

function nibbleSwap(byte: number): number {
  return ((byte & 0x0f) << 4) | ((byte & 0xf0) >> 4);
}

function encryptRound(byte: number, keyByte: number): number {
  // XOR, rotate left and nibble-swap for one round.
  const x = byte ^ keyByte;
  const y = rotateLeft(x, 1);
  const z = nibbleSwap(y);
  return z;
}

function decryptRound(byte: number, keyByte: number): number {
  // Reverse the nibble swap (it is its own inverse), rotate right and XOR.
  const y = nibbleSwap(byte);
  const x = rotateRight(y, 1);
  return x ^ keyByte;
}

export function advancedQHCEncrypt(
  plainText: string,
  secretKey: string
): string {
  const salt = generateSalt();
  const plainBuffer = Buffer.from(plainText, "utf8");
  const keyStream = generateKeyStream(secretKey, salt, plainBuffer.length);
  const cipherBuffer = Buffer.from(plainBuffer);

  // Perform 4 rounds of block transformation.
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < cipherBuffer.length; i++) {
      cipherBuffer[i] = encryptRound(cipherBuffer[i], keyStream[i]);
    }
  }

  // Output format: salt.hex + '.' + encrypted.hex
  const saltHex = salt.toString("hex");
  const encryptedHex = cipherBuffer.toString("hex");
  return saltHex + "." + encryptedHex;
}

export function advancedQHCDecrypt(
  encryptedData: string,
  secretKey: string
): string {
  // Format: saltHex + '.' + encryptedHex
  const parts = encryptedData.split(".");
  if (parts.length !== 2) throw new Error("Invalid encrypted format");
  const salt = Buffer.from(parts[0], "hex");
  const cipherBuffer = Buffer.from(parts[1], "hex");
  const keyStream = generateKeyStream(secretKey, salt, cipherBuffer.length);
  const plainBuffer = Buffer.from(cipherBuffer);

  // Reverse 4 rounds of decryption.
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < plainBuffer.length; i++) {
      plainBuffer[i] = decryptRound(plainBuffer[i], keyStream[i]);
    }
  }
  return plainBuffer.toString("utf8");
}

function base62Encode(num: bigint): string {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (num === BigInt(0)) return "0";
  let result = "";
  while (num > 0) {
    const rem = num % BigInt(62);
    result = chars[Number(rem)] + result;
    num = num / BigInt(62);
  }
  return result;
}

export function advancedQDSGenerateSignature(
  encryptedData: string,
  secretKey: string
): string {
  const parts = encryptedData.split(".");
  if (parts.length !== 2) throw new Error("Invalid encrypted format");
  const salt = Buffer.from(parts[0], "hex");
  const cipherBuffer = Buffer.from(parts[1], "hex");
  const keyStream = generateKeyStream(secretKey, salt, cipherBuffer.length);
  let hashValue = BigInt(0);
  for (let i = 0; i < cipherBuffer.length; i++) {
    hashValue += BigInt(cipherBuffer[i]) * BigInt(i + 1);
  }
  // Incorporate key stream influence.
  hashValue = hashValue ^ BigInt(keyStream[0]);
  // Convert the result to a Base62 string (pad/truncate to 8 characters).
  let signature = base62Encode(hashValue);
  signature = signature.padStart(8, "0").slice(0, 8);
  return signature;
}

export function advancedQDSVerifySignature(
  encryptedData: string,
  signature: string,
  secretKey: string
): boolean {
  const expectedSignature = advancedQDSGenerateSignature(
    encryptedData,
    secretKey
  );
  return expectedSignature === signature;
}

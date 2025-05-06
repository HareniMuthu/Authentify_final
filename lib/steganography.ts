// lib/steganography.ts

// Use TextEncoder/TextDecoder for robust UTF-8 handling
const encoder = new TextEncoder(); // Default is UTF-8
const decoder = new TextDecoder(); // Default is UTF-8

// Define constants
const LENGTH_BITS = 32; // Use 32 bits (4 bytes) to store the message length
const BITS_PER_BYTE = 8;
const CHANNELS_USED = 3; // Use R, G, B channels (skip Alpha)

/**
 * Encodes a UTF-8 message into the LSBs of an image's RGB channels.
 * Prepends the message length (32-bit unsigned int) to the data.
 * @param image The HTMLImageElement to use as the cover image.
 * @param message The string message to hide.
 * @returns A PNG Data URL string of the image with the hidden message.
 * @throws Error if message is too large for the image capacity or encoding fails.
 */
export const encodeImage = (
  image: HTMLImageElement,
  message: string
): string => {
  // 1. Encode the message string to a UTF-8 byte array
  const messageBytes = encoder.encode(message);
  const messageLength = messageBytes.length;
  console.log(`Encoding message: "${message}", Length: ${messageLength} bytes`);

  // 2. Prepare the length prefix (32-bit unsigned integer, Big Endian)
  const lengthBytes = new Uint8Array(LENGTH_BITS / BITS_PER_BYTE); // 4 bytes
  const dataView = new DataView(lengthBytes.buffer);
  dataView.setUint32(0, messageLength, false); // false for Big Endian

  // 3. Combine length bytes and message bytes into a single byte array
  const dataToEncode = new Uint8Array(lengthBytes.length + messageBytes.length);
  dataToEncode.set(lengthBytes, 0); // Place length at the beginning
  dataToEncode.set(messageBytes, lengthBytes.length); // Place message bytes after length

  // 4. Convert the combined byte array into a single binary string (series of '0's and '1's)
  let binaryDataString = "";
  for (let i = 0; i < dataToEncode.length; i++) {
    binaryDataString += dataToEncode[i]
      .toString(2)
      .padStart(BITS_PER_BYTE, "0");
  }
  const totalBitsToEncode = binaryDataString.length;
  console.log(`Total bits to encode (length + message): ${totalBitsToEncode}`);

  // 5. Prepare Canvas and get Pixel Data
  const canvas = document.createElement("canvas");
  // Use willReadFrequently hint for potential performance improvement
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2D canvas context");

  // Use naturalWidth/Height to ensure correct dimensions regardless of CSS scaling
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  ctx.drawImage(image, 0, 0); // Draw the original image onto the canvas

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data; // This is a Uint8ClampedArray [R, G, B, A, R, G, B, A, ...]

  // 6. Check Image Capacity
  // Calculate available bits using R, G, B channels
  const availablePixels = pixels.length / 4; // Total number of pixels
  const availableBits = availablePixels * CHANNELS_USED; // 3 bits per pixel (RGB)
  console.log(`Image capacity: ${availableBits} bits`);

  if (totalBitsToEncode > availableBits) {
    // Still throw error during encoding, as it's better to fail early
    throw new Error(
      `Data too large for image capacity. Needs ${totalBitsToEncode} bits, but image only has ${availableBits} available in RGB channels.`
    );
  }

  // 7. Encode the binary data string into the LSBs of RGB channels
  let dataIndex = 0; // Index for the binaryDataString
  for (let i = 0; i < pixels.length && dataIndex < totalBitsToEncode; i += 4) {
    // Iterate through pixels (steps of 4 for RGBA)
    // Encode one bit into R, G, B channels if needed
    for (
      let channel = 0;
      channel < CHANNELS_USED && dataIndex < totalBitsToEncode;
      channel++
    ) {
      const pixelIndex = i + channel; // Index for R, G, or B
      const currentPixelValue = pixels[pixelIndex];
      const dataBit = parseInt(binaryDataString[dataIndex], 2);

      // Modify the Least Significant Bit (LSB)
      pixels[pixelIndex] = (currentPixelValue & 0b11111110) | dataBit;
      dataIndex++; // Move to the next bit in the data string
    }
    // Alpha channel (pixels[i+3]) is skipped
  }

  // Verification: Ensure all bits were written
  if (dataIndex < totalBitsToEncode) {
    console.error(
      "Encoding loop finished, but not all data bits were written. Data index:",
      dataIndex,
      "Total bits:",
      totalBitsToEncode
    );
    // Still throw error during encoding
    throw new Error("Failed to write all data bits during encoding loop.");
  }
  console.log(`Successfully wrote ${dataIndex} bits.`);

  // 8. Put modified pixel data back onto the canvas
  ctx.putImageData(imageData, 0, 0);

  // 9. Return the canvas content as a PNG Data URL (lossless format required)
  return canvas.toDataURL("image/png");
};

/**
 * Decodes a UTF-8 message hidden in the LSBs of an image's RGB channels.
 * Assumes the message length (32-bit unsigned int) is encoded first.
 * @param image The HTMLImageElement containing the hidden message.
 * @returns The decoded string message, or null if decoding fails.
 */
export const decodeImage = (image: HTMLImageElement): string | null => {
  // Changed return type
  try {
    // Wrap decoding logic in a try...catch block
    // 1. Prepare Canvas and get Pixel Data
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      console.error("Could not get 2D canvas context for decoding.");
      return null; // Return null instead of throwing
    }

    // Use naturalWidth/Height for accuracy
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.drawImage(image, 0, 0); // Draw the image with hidden data

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // 2. Extract the bits for the length prefix (32 bits) from RGB LSBs
    let lengthBinaryString = "";
    let bitsExtracted = 0;
    for (let i = 0; i < pixels.length && bitsExtracted < LENGTH_BITS; i += 4) {
      for (
        let channel = 0;
        channel < CHANNELS_USED && bitsExtracted < LENGTH_BITS;
        channel++
      ) {
        const pixelIndex = i + channel;
        const lsb = pixels[pixelIndex] & 1; // Get LSB (0 or 1)
        lengthBinaryString += lsb.toString();
        bitsExtracted++;
      }
    }

    // Check if enough bits were extracted for the length
    if (bitsExtracted < LENGTH_BITS) {
      console.error(
        `Could not extract enough bits for message length prefix. Needed ${LENGTH_BITS}, got ${bitsExtracted}.`
      );
      return null; // Return null instead of throwing
    }
    console.log(`Extracted length binary string: ${lengthBinaryString}`);

    // 3. Convert the length binary string back to a number
    const lengthBytes = new Uint8Array(LENGTH_BITS / BITS_PER_BYTE);
    for (let i = 0; i < LENGTH_BITS / BITS_PER_BYTE; i++) {
      const byteString = lengthBinaryString.substring(
        i * BITS_PER_BYTE,
        (i + 1) * BITS_PER_BYTE
      );
      lengthBytes[i] = parseInt(byteString, 2);
    }
    const dataView = new DataView(lengthBytes.buffer);
    const messageLength = dataView.getUint32(0, false); // Read length as Big Endian

    console.log(`Decoded message length: ${messageLength} bytes`);

    // Handle edge case of zero-length message
    if (messageLength === 0) {
      console.log("Decoded message length is 0. Returning empty string.");
      return ""; // Empty string is a valid result here
    }

    // Basic sanity check for decoded length against image capacity
    const availablePixels = pixels.length / 4;
    const availableBits = availablePixels * CHANNELS_USED;
    if (LENGTH_BITS + messageLength * BITS_PER_BYTE > availableBits) {
      console.error(
        `Decoded message length (${messageLength} bytes) plus length prefix exceeds image capacity (${availableBits} bits). Image likely corrupted or wrong image.`
      );
      return null; // Return null instead of throwing
    }

    // 4. Extract the bits for the message body
    let messageBinaryString = "";
    const totalMessageBitsToExtract = messageLength * BITS_PER_BYTE;
    bitsExtracted = 0; // Reset counter for message bits

    for (
      let i = 0;
      i < pixels.length && bitsExtracted < totalMessageBitsToExtract;
      i += 4
    ) {
      for (
        let channel = 0;
        channel < CHANNELS_USED && bitsExtracted < totalMessageBitsToExtract;
        channel++
      ) {
        const pixelIndex = i + channel;
        const currentTotalBitIndex =
          Math.floor(pixelIndex / 4) * CHANNELS_USED + (pixelIndex % 4);

        if (currentTotalBitIndex < LENGTH_BITS) continue; // Skip length bits

        const lsb = pixels[pixelIndex] & 1;
        messageBinaryString += lsb.toString();
        bitsExtracted++;
      }
    }

    // Check if the correct number of message bits were extracted
    if (bitsExtracted < totalMessageBitsToExtract) {
      console.error(
        `Expected ${totalMessageBitsToExtract} message bits, but only extracted ${bitsExtracted}. Image might be corrupted or too small.`
      );
      return null; // Return null instead of throwing
    }
    console.log(`Extracted ${bitsExtracted} message bits.`);

    // 5. Convert the extracted message binary string to a byte array
    const messageBytes = new Uint8Array(messageLength);
    for (let i = 0; i < messageLength; i++) {
      const byteString = messageBinaryString.substring(
        i * BITS_PER_BYTE,
        (i + 1) * BITS_PER_BYTE
      );
      if (byteString.length !== BITS_PER_BYTE) {
        console.error(
          `Error reconstructing byte at index ${i}. Binary string segment: "${byteString}"`
        );
        return null; // Return null instead of throwing
      }
      messageBytes[i] = parseInt(byteString, 2);
    }

    // 6. Decode the byte array back to a UTF-8 string
    const decodedString = decoder.decode(messageBytes);
    console.log(`Decoded message: ${decodedString.substring(0, 20)}...`);
    return decodedString; // Return the successfully decoded string
  } catch (error) {
    // Catch any unexpected errors during the process
    console.error("Unexpected error during image decoding:", error);
    return null; // Return null for any other errors
  }
};

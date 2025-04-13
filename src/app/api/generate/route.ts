// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  advancedQHCEncrypt,
  advancedQDSGenerateSignature,
} from "../../../../lib/cryptoUtils";

export async function POST(request: NextRequest) {
  try {
    const {
      productName,
      sku,
      batch,
      manufactureDate,
      quantity,
      destinationShop,
      secretKey,
    } = await request.json();

    // Combine product details into one JSON string.
    const productData = JSON.stringify({
      productName,
      sku,
      batch,
      manufactureDate,
      quantity,
      destinationShop,
    });

    // Encrypt the product data.
    const encrypted = advancedQHCEncrypt(productData, secretKey);
    // Generate the signature.
    const signature = advancedQDSGenerateSignature(encrypted, secretKey);

    return NextResponse.json({ encrypted, signature, secretKey });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "An unknown error occurred" }, { status: 500 });
  }
}

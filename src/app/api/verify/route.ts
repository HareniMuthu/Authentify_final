// app/api/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  advancedQHCDecrypt,
  advancedQDSVerifySignature,
} from "../../../../lib/cryptoUtils";

export async function POST(request: NextRequest) {
  try {
    const { productQR, secretKey } = await request.json();
    const { encrypted, signature } = productQR;

    // Verify the signature.
    const isAuthentic = advancedQDSVerifySignature(
      encrypted,
      signature,
      secretKey
    );
    if (!isAuthentic) {
      return NextResponse.json({
        message: "❌ Product has been TAMPERED or is FAKE",
      });
    }

    // Optionally, decrypt the product data to show details.
    const decryptedData = advancedQHCDecrypt(encrypted, secretKey);
    return NextResponse.json({
      message: "✅ Product is AUTHENTIC",
      details: decryptedData,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 }
    );
  }
}

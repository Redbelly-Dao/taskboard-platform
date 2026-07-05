import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getAdminAuth } from "@/lib/firebase-admin";
import { walletToEmail, buildResetMessage, verifyWalletSignature } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  try {
    const { wallet, newPassword, message, signature } = await req.json();

    if (!wallet || !newPassword || !message || !signature) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!wallet.startsWith("0x") || wallet.length < 10) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Verify the message contains the correct wallet
    const expectedWallet = wallet.toLowerCase();
    if (!message.includes(expectedWallet)) {
      return NextResponse.json({ error: "Message wallet mismatch" }, { status: 400 });
    }

    // Extract the window timestamp from the message and validate it's within ±1 window (10 min)
    const windowMatch = message.match(/Window: (\d+)/);
    if (!windowMatch) {
      return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    }
    const messageWindow = parseInt(windowMatch[1], 10);
    const currentWindow = Math.floor(Date.now() / 1000 / 300);
    if (Math.abs(currentWindow - messageWindow) > 1) {
      return NextResponse.json({ error: "Signature has expired. Please try again." }, { status: 400 });
    }

    // Recover the signer from the signature using audited viem
    const isValid = await verifyWalletSignature(message, signature, expectedWallet);
    if (!isValid) {
      return NextResponse.json({ error: "Signature does not match wallet address" }, { status: 403 });
    }

    // Look up the Firebase Auth user by their wallet-derived email
    const auth = getAdminAuth();
    const email = walletToEmail(wallet);

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch {
      return NextResponse.json({ error: "No account found for this wallet address" }, { status: 404 });
    }

    await auth.updateUser(userRecord.uid, { password: newPassword });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("reset-password error:", err);
    const isDev = process.env.NODE_ENV === 'development';
    const msg = (err as Error)?.message || 'Internal server error';
    return NextResponse.json({ error: isDev ? msg : 'Internal server error' }, { status: 500 });
  }
}

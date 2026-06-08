import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import * as admin from "firebase-admin";

function getAdminApp() {
  if (admin.apps.length) return admin.apps[0]!;
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const walletToEmail = (wallet: string) =>
  `${wallet.toLowerCase()}@redbelly-taskboard.dao`;

// Message the client must sign; includes a timestamp rounded to 5-minute windows
// so the signature is valid for at most ~10 minutes and can't be replayed later.
export function buildResetMessage(wallet: string, windowTs: number) {
  return `Redbelly DAO Password Reset\nWallet: ${wallet.toLowerCase()}\nWindow: ${windowTs}`;
}

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

    // Recover the signer from the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (recoveredAddress.toLowerCase() !== expectedWallet) {
      return NextResponse.json({ error: "Signature does not match wallet address" }, { status: 403 });
    }

    // Look up the Firebase Auth user by their wallet-derived email
    const app = getAdminApp();
    const auth = admin.auth(app);
    const email = walletToEmail(wallet);

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch {
      return NextResponse.json({ error: "No account found for this wallet address" }, { status: 404 });
    }

    await auth.updateUser(userRecord.uid, { password: newPassword });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

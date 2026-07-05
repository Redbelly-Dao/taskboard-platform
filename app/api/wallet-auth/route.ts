import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { walletToEmail, verifyWalletSignature } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  try {
    const { wallet, message, signature, isRegister } = await req.json();

    if (!wallet || !message || !signature) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!wallet.startsWith("0x") || wallet.length < 10) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }

    const expectedWallet = wallet.toLowerCase();
    if (!message.includes(expectedWallet)) {
      return NextResponse.json({ error: "Message mismatch" }, { status: 400 });
    }

    const windowMatch = message.match(/Window: (\d+)/);
    if (!windowMatch) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }
    const messageWindow = parseInt(windowMatch[1], 10);
    const currentWindow = Math.floor(Date.now() / 1000 / 300);
    if (Math.abs(currentWindow - messageWindow) > 1) {
      return NextResponse.json({ error: "Signature expired" }, { status: 400 });
    }

    const isValid = await verifyWalletSignature(message, signature, expectedWallet);
    if (!isValid) {
      return NextResponse.json({ error: "Signature mismatch" }, { status: 403 });
    }

    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const email = walletToEmail(wallet);
    const lowerWallet = expectedWallet;

    let userRecord: admin.auth.UserRecord;
    let createdNewAuth = false;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch {
      // Create Auth user for this wallet (for both register and to support migration)
      const randomPass = Math.random().toString(36).slice(2) + Date.now().toString(36);
      userRecord = await auth.createUser({ email, password: randomPass });
      createdNewAuth = true;
    }

    // Link/migrate profile by walletAddress so old password or Firestore-only admins
    // seamlessly get their role (admin etc.) under the current Auth uid.
    const profileSnap = await firestore.collection("users")
      .where("walletAddress", "==", lowerWallet)
      .limit(1)
      .get();

    let profileData;
    if (!profileSnap.empty) {
      profileData = profileSnap.docs[0].data();
      profileData.uid = userRecord.uid;
    } else {
      profileData = {
        uid: userRecord.uid,
        walletAddress: lowerWallet,
        email,
        role: "contributor",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    // Apply pending pre-grant (from admin "add user") if present.
    // This works for both new register and login flows.
    const pendingDoc = await firestore.collection("pendingGrants").doc(lowerWallet).get();
    if (pendingDoc.exists) {
      const p = pendingDoc.data() || {};
      if (p.role) profileData.role = p.role;
      if (p.username) profileData.username = p.username;
      if (p.discordHandle) profileData.discordHandle = p.discordHandle;
      if (p.reviewerCategories) profileData.reviewerCategories = p.reviewerCategories;
      await pendingDoc.ref.delete();
    }

    await firestore.collection("users").doc(userRecord.uid).set(profileData);

    // Create custom token (passwordless)
    const customToken = await auth.createCustomToken(userRecord.uid);

    return NextResponse.json({ success: true, customToken, uid: userRecord.uid });
  } catch (err: unknown) {
    console.error("wallet-auth error:", err);
    const isDev = process.env.NODE_ENV === 'development';
    const msg = (err as Error)?.message || 'Internal error';
    return NextResponse.json({ error: isDev ? msg : 'Internal error' }, { status: 500 });
  }
}

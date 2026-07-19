import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { walletToEmail, verifyWalletSignature } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  try {
    const { wallet, message, signature, isRegister, discordHandle, username } = await req.json();

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

    // Link/migrate profile by wallet so password-based or Firestore-only admins keep their role under the current Auth uid.
    const profileSnap = await firestore.collection("users")
      .where("walletAddress", "==", lowerWallet)
      .limit(1)
      .get();

    const pendingDoc = await firestore.collection("pendingGrants").doc(lowerWallet).get();
    const cleanupNewAuth = async () => { if (createdNewAuth) await auth.deleteUser(userRecord.uid).catch(() => {}); };

    let profileData: admin.firestore.DocumentData;
    if (!profileSnap.empty) {
      // Existing profile: link it to the current Auth uid (role/migration preserved).
      profileData = profileSnap.docs[0].data();
      profileData.uid = userRecord.uid;
    } else if (isRegister) {
      // New registration: a Discord handle and a unique username are mandatory.
      const dh = (discordHandle || "").trim();
      const un = (username || "").trim();
      if (!dh || !un) {
        await cleanupNewAuth();
        return NextResponse.json({ error: "A Discord handle and a username are both required to register." }, { status: 400 });
      }
      const dupe = await firestore.collection("users").where("username", "==", un).limit(1).get();
      if (!dupe.empty) {
        await cleanupNewAuth();
        return NextResponse.json({ error: "That username is already taken. Please choose another." }, { status: 409 });
      }
      profileData = {
        uid: userRecord.uid,
        walletAddress: lowerWallet,
        email,
        role: "contributor",
        discordHandle: dh,
        username: un,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    } else if (pendingDoc.exists) {
      // Admin pre-granted this wallet: let the first sign-in materialise a profile.
      profileData = {
        uid: userRecord.uid,
        walletAddress: lowerWallet,
        email,
        role: "contributor",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    } else {
      // Login with no account and no pre-grant: never silently create one.
      await cleanupNewAuth();
      return NextResponse.json({ error: "No account is registered for this wallet. Please create an account first." }, { status: 404 });
    }

    // Apply pending pre-grant (from admin "add user") if present. This works for both new register and login flows.
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

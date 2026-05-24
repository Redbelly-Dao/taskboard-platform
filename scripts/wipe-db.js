#!/usr/bin/env node
/**
 * Wipe all Redbelly DAO taskboard data — Firestore collections AND Firebase Auth users.
 *
 * Usage:
 *   node scripts/wipe-db.js path/to/serviceAccountKey.json
 *
 * Get your service account key from Firebase Console →
 *   Project Settings → Service Accounts → Generate new private key
 *
 * IMPORTANT: This is irreversible. All submissions, users, tasks AND
 * all Firebase Auth accounts will be permanently deleted.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const path = require("path");
const readline = require("readline");

const COLLECTIONS = ["submissions", "users", "tasks"];

async function deleteCollection(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  if (snap.empty) {
    console.log(`  ${collectionName}: empty, skipping`);
    return 0;
  }

  let deleted = 0;
  const chunks = [];
  for (let i = 0; i < snap.docs.length; i += 400) {
    chunks.push(snap.docs.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += chunk.length;
  }

  console.log(`  ${collectionName}: deleted ${deleted} document${deleted !== 1 ? "s" : ""}`);
  return deleted;
}

async function deleteAllAuthUsers(auth) {
  let deleted = 0;
  let pageToken;

  do {
    const result = await auth.listUsers(1000, pageToken);
    if (result.users.length === 0) break;

    const uids = result.users.map((u) => u.uid);
    await auth.deleteUsers(uids);
    deleted += uids.length;
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`  Firebase Auth: deleted ${deleted} account${deleted !== 1 ? "s" : ""}`);
  return deleted;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error("Usage: node scripts/wipe-db.js path/to/serviceAccountKey.json");
    process.exit(1);
  }

  const serviceAccount = require(path.resolve(keyPath));

  console.log("\n⚠️  DATABASE WIPE SCRIPT");
  console.log("══════════════════════════════════════════");
  console.log(`Project: ${serviceAccount.project_id}`);
  console.log(`Firestore: ${COLLECTIONS.join(", ")}`);
  console.log(`Auth: ALL user accounts`);
  console.log("══════════════════════════════════════════\n");

  const answer = await confirm('Type "WIPE" to confirm permanent deletion: ');
  if (answer !== "wipe") {
    console.log("Aborted. No data was deleted.");
    process.exit(0);
  }

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const auth = getAuth();

  console.log("\nDeleting Firestore collections...");
  let total = 0;
  for (const col of COLLECTIONS) {
    total += await deleteCollection(db, col);
  }

  console.log("\nDeleting Firebase Auth accounts...");
  total += await deleteAllAuthUsers(auth);

  console.log(`\nDone. ${total} total records deleted.`);
  console.log("Next steps:");
  console.log("  1. node scripts/seed-tasks.js path/to/serviceAccountKey.json");
  console.log("  2. Register your account on the site");
  console.log("  3. Promote yourself to admin in Firestore → users → your doc → role: admin");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

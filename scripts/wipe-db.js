#!/usr/bin/env node
/**
 * Wipe all Redbelly DAO taskboard Firestore data.
 *
 * Usage:
 *   node scripts/wipe-db.js path/to/serviceAccountKey.json
 *
 * Get your service account key from Firebase Console →
 *   Project Settings → Service Accounts → Generate new private key
 *
 * IMPORTANT: This is irreversible. All submissions, users, and tasks
 * will be permanently deleted.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const readline = require("readline");

const COLLECTIONS = ["submissions", "users", "tasks"];

async function deleteCollection(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  if (snap.empty) {
    console.log(`  ${collectionName}: empty, skipping`);
    return 0;
  }

  // Delete in batches of 400 (Firestore limit is 500)
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
  console.log(`Collections: ${COLLECTIONS.join(", ")}`);
  console.log("══════════════════════════════════════════\n");

  const answer = await confirm('Type "WIPE" to confirm permanent deletion: ');
  if (answer !== "wipe") {
    console.log("Aborted. No data was deleted.");
    process.exit(0);
  }

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log("\nDeleting collections...");
  let total = 0;
  for (const col of COLLECTIONS) {
    total += await deleteCollection(db, col);
  }

  console.log(`\nDone. ${total} total documents deleted.`);
  console.log("Run scripts/seed-tasks.js next to repopulate the tasks collection.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

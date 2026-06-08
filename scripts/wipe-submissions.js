#!/usr/bin/env node
/**
 * Wipe all submissions (and their messages subcollections) from Firestore.
 * Tasks, users, and Firebase Auth accounts are NOT touched.
 *
 * Usage:
 *   node scripts/wipe-submissions.js path/to/serviceAccountKey.json
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const readline = require("readline");

async function deleteSubcollection(db, parentPath, subcollection) {
  const snap = await db.collection(`${parentPath}/${subcollection}`).get();
  if (snap.empty) return;
  const chunks = [];
  for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

async function main() {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error("Usage: node scripts/wipe-submissions.js path/to/serviceAccountKey.json");
    process.exit(1);
  }

  const serviceAccount = require(path.resolve(keyPath));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const snap = await db.collection("submissions").get();
  console.log(`\nFound ${snap.docs.length} submission(s) to delete.`);
  if (snap.empty) { console.log("Nothing to delete."); process.exit(0); }

  const answer = await confirm('Type "WIPE" to confirm permanent deletion: ');
  if (answer !== "wipe") { console.log("Aborted."); process.exit(0); }

  console.log("Deleting messages subcollections...");
  for (const subDoc of snap.docs) {
    await deleteSubcollection(db, `submissions/${subDoc.id}`, "messages");
  }

  console.log("Deleting submission documents...");
  const chunks = [];
  for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`Done. ${snap.docs.length} submission(s) deleted. Tasks and users untouched.`);
  process.exit(0);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });

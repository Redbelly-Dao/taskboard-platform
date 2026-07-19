import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// A lightweight directory of reviewers published by the admin panel to config/reviewers.
// Reviewers cannot read the users collection (rules forbid it),
// so this doc backs the "reassign to another reviewer" dropdown. It holds only safe fields, never contributor PII.
export interface ReviewerDirectoryEntry {
  uid: string;
  wallet?: string | null;
  name?: string | null;
  categories?: string[];
}

export async function publishReviewerDirectory(list: ReviewerDirectoryEntry[]): Promise<void> {
  try {
    await setDoc(doc(db, "config", "reviewers"), { list, updatedAt: Date.now() });
  } catch { /* non-fatal: the dropdown falls back to a text field */ }
}

export async function loadReviewerDirectory(): Promise<ReviewerDirectoryEntry[]> {
  try {
    const snap = await getDoc(doc(db, "config", "reviewers"));
    const data = snap.data();
    return Array.isArray(data?.list) ? (data.list as ReviewerDirectoryEntry[]) : [];
  } catch {
    return [];
  }
}

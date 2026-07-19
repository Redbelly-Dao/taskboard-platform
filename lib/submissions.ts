import { collection, doc, getDocs, query, runTransaction, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { pickWinner } from "./ledger";

// The per-task submission cap counts only ACTIVE submissions.
// Rejected and withdrawn submissions free their slot, so both are excluded.
// One function owns this so every path (submit, resubmit, reject, override, withdraw) stays in sync.
export async function recountTaskActive(taskId: string): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, "submissions"), where("taskId", "==", taskId)));
    const active = snap.docs.filter((d) => {
      const s = d.data().status;
      return s !== "rejected" && s !== "withdrawn";
    }).length;
    await updateDoc(doc(db, "tasks", taskId), { submissionCount: active });
  } catch { /* self-heals on the next decision */ }
}

// Rulebook s03: a shortlisted submission that is not selected is refunded to the contributor's cycle cap.
// Called from both places a task can become "completed"
// (AdminProvider and the reviewer page's admin-only status control).
// Only runs once a winner is actually known: an unresolved tie means nobody should be refunded yet,
// since the eventual winner could still be among the "not selected" set.
// `capRefunded` makes each submission a one-time refund even if the task is un-completed and re-completed.
export async function refundNotSelectedCaps(subsForTask: any[]): Promise<string[]> {
  const { winner } = pickWinner(subsForTask);
  if (!winner) return [];
  const toRefund = subsForTask.filter((s) => s.status === "approved" && s.id !== winner.id && !s.capRefunded);
  const refundedIds: string[] = [];
  for (const sub of toRefund) {
    if (!sub.contributorId || sub.cycle == null) continue;
    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", sub.contributorId);
        const subRef = doc(db, "submissions", sub.id);
        const [userSnap, subSnap] = await Promise.all([tx.get(userRef), tx.get(subRef)]);
        if (subSnap.data()?.capRefunded) return; // already refunded, guard against a concurrent completion
        const current = userSnap.data()?.cycleCounts?.[String(sub.cycle)] ?? 0;
        tx.update(userRef, { [`cycleCounts.${sub.cycle}`]: Math.max(0, current - 1) });
        tx.update(subRef, { capRefunded: true });
      });
      refundedIds.push(sub.id);
    } catch { /* one bad doc shouldn't block the rest; retried next completion since capRefunded stays unset */ }
  }
  return refundedIds;
}

import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { endOfDay, daysUntil } from "@/lib/cycle";
import { reviewClock } from "@/lib/review-clock";

// Daily sweep (see vercel.json); everything here is otherwise only checked when someone opens a page.
// Idempotent: every write is guarded by a flag or status check, so a re-run or overlapping run is a no-op on anything handled.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const FieldValue = admin.firestore.FieldValue;
  const now = Date.now();

  let autoRejected = 0;
  let reminders = 0;
  let overdueFlagged = 0;

  // Mirrors recountTaskActive in lib/submissions.ts: per-task cap counts active submissions, so rejecting frees a slot.
  const recountTaskActive = async (taskId: string, decidedSubId: string) => {
    const snap = await db.collection("submissions").where("taskId", "==", taskId).get();
    const active = snap.docs.filter((d) => {
      const status = d.id === decidedSubId ? "rejected" : d.data().status;
      return status !== "rejected" && status !== "withdrawn";
    }).length;
    await db.collection("tasks").doc(taskId).update({ submissionCount: active });
  };

  // (a) auto-reject missed revisions, (b) day-3 reminder before the deadline.
  const revisionSnap = await db.collection("submissions").where("status", "==", "revision_requested").get();
  for (const snap of revisionSnap.docs) {
    const sub = snap.data();
    if (!sub.revisionDeadline) continue;
    const deadlineEnd = endOfDay(sub.revisionDeadline);
    if (deadlineEnd == null) continue;

    try {
      if (now > deadlineEnd) {
        await snap.ref.update({
          status: "rejected",
          autoRejected: true,
          rejectedReason: "revision_deadline_missed",
          reviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (sub.taskId) await recountTaskActive(sub.taskId, snap.id);

        await snap.ref.collection("messages").add({
          senderId: "system",
          senderWallet: "",
          senderName: "System",
          senderRole: "system",
          message: "The revision window closed without a resubmission. This submission has been automatically rejected.",
          createdAt: FieldValue.serverTimestamp(),
        });

        if (sub.contributorId) {
          await db.collection("notifications").add({
            type: "revision_expired",
            submissionId: snap.id,
            taskId: sub.taskId ?? null,
            taskTitle: sub.taskTitle ?? null,
            senderWallet: "",
            senderRole: "system",
            messagePreview: "Revision window missed: submission auto-rejected",
            recipientId: sub.contributorId,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        autoRejected++;
        continue;
      }

      if (!sub.revisionReminderSent) {
        const daysLeft = daysUntil(sub.revisionDeadline, now);
        if (daysLeft != null && daysLeft <= 2 && sub.contributorId) {
          await db.collection("notifications").add({
            type: "revision_reminder",
            submissionId: snap.id,
            taskId: sub.taskId ?? null,
            taskTitle: sub.taskTitle ?? null,
            senderWallet: "",
            senderRole: "system",
            messagePreview: `Revision due ${sub.revisionDeadline}`,
            recipientId: sub.contributorId,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
          await snap.ref.update({ revisionReminderSent: true });
          reminders++;
        }
      }
    } catch {
      // one bad doc shouldn't sink the rest of the sweep; picked up again next run
    }
  }

  // (c) flag reviews past their due date (3 days first pass, 2 days re-review).
  const underReviewSnap = await db.collection("submissions").where("status", "==", "under_review").get();
  for (const snap of underReviewSnap.docs) {
    const sub = snap.data();
    if (sub.reviewOverdueNotified) continue;
    const clock = reviewClock(sub, now);
    if (!clock?.overdue) continue;

    try {
      await db.collection("notifications").add({
        type: "review_overdue",
        submissionId: snap.id,
        taskId: sub.taskId ?? null,
        taskTitle: sub.taskTitle ?? null,
        senderWallet: "",
        senderRole: "system",
        messagePreview: `Review overdue: ${sub.taskTitle ?? sub.taskId ?? snap.id}`,
        recipientId: null,
        forAdmins: true,
        readBy: [],
        createdAt: FieldValue.serverTimestamp(),
      });
      await snap.ref.update({ reviewOverdueNotified: true });
      overdueFlagged++;
    } catch {
      // picked up again next run
    }
  }

  return NextResponse.json({ autoRejected, reminders, overdueFlagged });
}

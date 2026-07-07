"use client";
import { getSubmissionStatusLabel, shortWallet } from "@/lib/tasks";

// ONE mutually-exclusive state pill per submission (plus an "overridden" flag).
// A submission is either decided (approved/rejected/revision), locked by someone
// (in review / you), waiting on a hand-off, or free (awaiting review) - never a
// contradictory mix like "awaiting review" + "in review" at once.
export function StatusChips({
  sub,
  currentUserId,
  isAdmin,
}: {
  sub: any;
  currentUserId?: string;
  isAdmin: boolean;
}) {
  const lockedByOther = sub.reviewingBy && sub.reviewingBy !== currentUserId;
  const lockedByMe = sub.reviewingBy && sub.reviewingBy === currentUserId;

  let chip;
  if (sub.status !== "under_review") {
    chip = <span className={`badge-${sub.status} text-[10px]`}>{getSubmissionStatusLabel(sub.status)}</span>;
  } else if (lockedByMe) {
    chip = <span className="badge bg-blue-50 text-blue-700 text-[10px]">You are reviewing</span>;
  } else if (lockedByOther) {
    const who = sub.reviewingByName || shortWallet(sub.reviewingByWallet);
    chip = (
      <span className="badge bg-amber-50 text-amber-700 text-[10px]" title={`Being reviewed by ${who || "another reviewer"}`}>
        In review{who ? ` · ${who}` : ""}
      </span>
    );
  } else if (sub.handoffRequested) {
    chip = (
      <span className="badge bg-amber-50 text-amber-800 text-[10px]" title={sub.handoffNote || "A reviewer asked for someone else to take this"}>
        Hand-off wanted{sub.handoffToWallet ? ` → ${shortWallet(sub.handoffToWallet)}` : ""}
      </span>
    );
  } else {
    chip = <span className="badge-under_review text-[10px]">Awaiting review</span>;
  }

  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {chip}
      {isAdmin && sub.adminOverride && <span className="badge bg-yellow-50 text-yellow-700 text-[10px]">overridden</span>}
    </div>
  );
}

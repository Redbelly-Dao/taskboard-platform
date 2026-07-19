// Reviewer clock: first decision due 3 days after a submission lands, re-review due 2 days after a resubmission.
// Pure and Firestore-agnostic so the client badges and the server sweep share one definition of "overdue".

export const FIRST_REVIEW_DAYS = 3;
export const RE_REVIEW_DAYS = 2;

// Accepts a client Timestamp, an admin Timestamp, a plain Date, or an ISO string,
// since submissions pass through both SDKs depending on the write path.
type TimestampLike = { toMillis?: () => number; seconds?: number } | Date | string | null | undefined;

const toMillis = (v: TimestampLike): number | null => {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
};

export interface ReviewClock {
  dueAt: number;
  daysLeft: number; // whole days remaining, floor; 0 means due today
  overdue: boolean;
}

// Null when there's no createdAt to clock from yet.
export function reviewClock(
  sub: { createdAt?: TimestampLike; resubmittedAt?: TimestampLike },
  now: number = Date.now()
): ReviewClock | null {
  const created = toMillis(sub.createdAt);
  const resubmitted = toMillis(sub.resubmittedAt);
  // A resubmission only starts a fresh (shorter) clock if it's actually later than the original submission;
  // otherwise fall back to the first-review clock.
  const start = resubmitted != null && (created == null || resubmitted > created)
    ? { at: resubmitted, days: RE_REVIEW_DAYS }
    : created != null
    ? { at: created, days: FIRST_REVIEW_DAYS }
    : null;
  if (!start) return null;

  const dueAt = start.at + start.days * 86_400_000;
  return { dueAt, daysLeft: Math.floor((dueAt - now) / 86_400_000), overdue: now > dueAt };
}

// "Due in 2d" / "Due today" / "Overdue 3d", or null if there's nothing to show.
export function reviewClockLabel(clock: ReviewClock | null, now: number = Date.now()): string | null {
  if (!clock) return null;
  if (clock.overdue) {
    const days = Math.max(1, Math.ceil((now - clock.dueAt) / 86_400_000));
    return `Overdue ${days}d`;
  }
  if (clock.daysLeft <= 0) return "Due today";
  return `Due in ${clock.daysLeft}d`;
}

// Text colour for the label above. Reuses existing tokens, no new ones.
export function reviewClockClass(clock: ReviewClock | null): string {
  if (!clock) return "";
  if (clock.overdue) return "text-error";
  if (clock.daysLeft <= 0) return "text-warn";
  return "text-outline";
}

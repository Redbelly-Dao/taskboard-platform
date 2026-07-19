"use client";
import { reviewClock, reviewClockLabel, reviewClockClass } from "@/lib/review-clock";

// Due/overdue indicator for a submission still awaiting a decision.
// Silent (renders nothing) once decided, or before createdAt has landed on the doc.
export function ReviewClockBadge({ sub, className = "" }: { sub: any; className?: string }) {
  if (sub.status !== "under_review") return null;
  const clock = reviewClock(sub);
  const label = reviewClockLabel(clock);
  if (!label) return null;
  return <span className={`text-[10px] font-semibold ${reviewClockClass(clock)} ${className}`}>{label}</span>;
}

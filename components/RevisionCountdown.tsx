"use client";
import { useEffect, useState } from "react";

// Live countdown to a revision deadline (end of the given day).
// Reddens in the final 24 hours and reads "overdue" once passed.
export default function RevisionCountdown({ deadline, className = "" }: { deadline?: string | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!deadline) return null;
  const target = new Date(`${deadline}T23:59:59`).getTime();
  if (Number.isNaN(target)) return null;

  const ms = target - now;
  const overdue = ms <= 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const urgent = !overdue && ms < 86_400_000;

  const label = overdue
    ? "Revision overdue"
    : days > 0
      ? `${days}d ${hours}h left to resubmit`
      : `${hours}h ${mins}m left to resubmit`;
  const color = overdue || urgent ? "text-error" : "text-outline";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${color} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

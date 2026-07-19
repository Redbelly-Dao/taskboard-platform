// Cycle model (B1). `config/cycle` used to be just { current: number }.
// Cycle 2 adds real dates so the board can enforce a submission freeze and show a countdown.
// All dates are ISO strings (YYYY-MM-DD) entered by the admin.

export interface Cycle {
  current: number;
  openAt?: string;   // cycle opens
  freezeAt?: string; // new submissions close (10 days before close)
  closeAt?: string;  // cycle ends
  payAt?: string;    // payment target
  lastRevisionAt?: string; // hard cap: no revision deadline may fall after this date
}

export const endOfDay = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(`${iso}T23:59:59`).getTime();
  return Number.isNaN(t) ? null : t;
};

// New submissions are blocked once the freeze date has passed.
// Resubmissions against an already-open revision are handled separately and stay allowed.
export const isFrozen = (cycle?: Cycle | null, now: number = Date.now()): boolean => {
  const f = endOfDay(cycle?.freezeAt);
  return f != null && now > f;
};

export type CyclePhase = "before" | "open" | "frozen" | "closed";

export const cyclePhase = (cycle?: Cycle | null, now: number = Date.now()): CyclePhase => {
  const open = cycle?.openAt ? new Date(`${cycle.openAt}T00:00:00`).getTime() : null;
  const freeze = endOfDay(cycle?.freezeAt);
  const close = endOfDay(cycle?.closeAt);
  if (open != null && now < open) return "before";
  if (close != null && now > close) return "closed";
  if (freeze != null && now > freeze) return "frozen";
  return "open";
};

// ISO date (YYYY-MM-DD) n days from now. Used to auto-assign a revision deadline when a reviewer requests changes.
export const daysFromNow = (n: number, now: number = Date.now()): string =>
  new Date(now + n * 86_400_000).toISOString().slice(0, 10);

// REVISION_DAYS from now can land after the cycle's own cutoff near cycle close;
// never let a revision deadline run past cycle.lastRevisionAt.
export const clampRevisionDeadline = (iso: string, cycle?: Cycle | null): string => {
  if (!cycle?.lastRevisionAt) return iso;
  return iso < cycle.lastRevisionAt ? iso : cycle.lastRevisionAt;
};

// Whole days from now until the given ISO date (end of that day).
// Negative if already past. Used for the dashboard countdown.
export const daysUntil = (iso?: string, now: number = Date.now()): number | null => {
  const t = endOfDay(iso);
  if (t == null) return null;
  return Math.ceil((t - now) / 86_400_000);
};

// "opens in 3 days" / "freezes in 2 days" / "5 days left" style helper.
export const countdownLabel = (cycle?: Cycle | null, now: number = Date.now()): string | null => {
  if (!cycle) return null;
  const phase = cyclePhase(cycle, now);
  if (phase === "before") {
    const d = daysUntil(cycle.openAt, now);
    return d != null ? `Opens in ${d} day${d === 1 ? "" : "s"}` : null;
  }
  if (phase === "open") {
    const d = daysUntil(cycle.freezeAt, now);
    if (d != null) return `Submissions close in ${d} day${d === 1 ? "" : "s"}`;
    const c = daysUntil(cycle.closeAt, now);
    return c != null ? `${c} day${c === 1 ? "" : "s"} left in cycle` : null;
  }
  if (phase === "frozen") {
    const d = daysUntil(cycle.closeAt, now);
    return d != null ? `Submissions closed · cycle ends in ${d} day${d === 1 ? "" : "s"}` : "Submissions closed";
  }
  return "Cycle closed";
};

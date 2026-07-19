import { RUBRIC_CRITERIA } from "./tasks";

// Rulebook 09: a contributor may appeal a rejection or a winner selection within this many days of the decision.
// One appeal per submission, enforced by using the submission id as the appeal doc id (see firestore.rules).
export const APPEAL_WINDOW_DAYS = 7;
export const APPEAL_STATEMENT_MAX = 1500;

export type AppealType = "rejection" | "winner_selection";
export type AppealStatus = "open" | "upheld" | "overturned";

export interface Appeal {
  id: string; // == submissionId
  submissionId: string;
  taskId: string;
  taskNumber: number;
  taskTitle: string;
  contributorId: string;
  contributorName: string;
  type: AppealType;
  criterionIndex: number;
  statement: string;
  status: AppealStatus;
  adminNote?: string | null;
  cosignedBy?: string | null;
  cycle?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Short label for a rubric criterion: the text before the colon.
// Shared so the contributor's appeal form and the admin Appeals tab always agree on wording.
export const criterionShortLabel = (i: number): string => (RUBRIC_CRITERIA[i] ?? "").split(":")[0].trim();

// Seconds since epoch from a Firestore Timestamp, a `{ seconds }` stand-in (used for optimistic local state),
// or null/undefined.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const secondsOf = (ts: any): number | null => {
  if (!ts) return null;
  if (typeof ts.seconds === "number") return ts.seconds;
  if (typeof ts.toDate === "function") return ts.toDate().getTime() / 1000;
  return null;
};

// True while the decision is still inside the appeal window.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const withinAppealWindow = (decidedAt: any, now: number = Date.now()): boolean => {
  const s = secondsOf(decidedAt);
  if (s == null) return false;
  return now - s * 1000 <= APPEAL_WINDOW_DAYS * 86_400_000;
};

export const getAppealStatusLabel = (status?: string): string => ({
  open: "Open",
  upheld: "Upheld",
  overturned: "Overturned",
}[status ?? ""] ?? (status ?? ""));

export const getAppealTypeLabel = (type?: string): string => ({
  rejection: "Rejection",
  winner_selection: "Winner selection",
}[type ?? ""] ?? (type ?? ""));

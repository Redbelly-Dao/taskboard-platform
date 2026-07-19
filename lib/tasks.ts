export type TaskCategory = "developer" | "design" | "research" | "documentation" | "content";

export interface Task {
  id: string;
  number: number;
  title: string;
  category: TaskCategory;
  reward: number;
  rewardRbnt?: number;
  reviewerComp: number;
  paymentSplit: string;
  status: "open" | "assigned" | "in_progress" | "completed" | "paused";
  shortDescription: string;
  problem: string;
  deliverables: string[];
  qualityBenchmarks: string[];
  failureCriteria: string[];
  technicalRequirements?: string[];
  infrastructure?: string[];
  maxSubmissions?: number; // e.g. 5; editable by admin, defaults to 5
  submissionCount?: number; // public running total, so contributors see + are gated by the cap
  // Per-task reviewer assignment (Cycle 2). One reviewer owns every submission on a task.
  // Locked when the task opens; enforced bidirectionally (an assigned reviewer cannot submit here,
  // and a prior submitter cannot be assigned).
  reviewerId?: string | null;
  reviewerWallet?: string | null;
  reviewerName?: string | null;
  cycle?: number; // the cycle a task belongs to; tasks older than the current cycle are "carried over"
  // Stamped once, the first time status becomes "completed". Never overwritten on later status changes,
  // since the winner-selection appeal window (rulebook 09) keys off this timestamp.
  completedAt?: unknown;
  // Winner recommendation: the assigned reviewer's written pick, delivered once every submission is decided.
  // Editable until the task is completed; a re-submit overwrites all four fields together.
  recommendedWinnerId?: string | null;
  winnerRecommendationNote?: string | null;
  winnerRecommendedAt?: unknown;
  winnerRecommendedBy?: string | null;
}

// The community-safe / admin view of a submission. Every call site used `any` before;
// this documents the real shape without forcing exhaustive typing.
export interface Submission {
  id: string;
  taskId: string;
  taskTitle?: string;
  contributorId: string;
  walletAddress?: string;
  username?: string;
  discordHandle?: string;
  githubLink?: string;
  liveLink?: string;
  publishedLink?: string;
  fileUrl?: string;
  fileName?: string;
  notes?: string;
  status: SubmissionStatus;
  cycle?: number;
  reviewTotalScore?: number | null;
  reviewScores?: number[];
  reviewJustifications?: string[];
  reviewDecision?: "approved" | "revision" | "rejected" | null;
  reviewerId?: string | null;
  reviewerWallet?: string | null;
  reviewerName?: string | null;
  revisionCount?: number;
  requiredChanges?: string | null;
  revisionDeadline?: string | null;
  rejectedReason?: string | null;
  paymentWinner?: boolean;
  paymentProcessed?: boolean;
  // Set once a not-selected shortlisted submission's cap slot has been refunded on task completion (rulebook 03).
  // Prevents a double refund if the task is un-completed and re-completed.
  capRefunded?: boolean;
  // Rights: signed at submission, but only transfer on payment (B4).
  rightsSignature?: string;
  rightsVersion?: string;
  creditName?: string;
  rightsSignedAt?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const formatReward = (rbnt?: number, usd?: number): string => {
  if (rbnt && usd) return `${rbnt.toLocaleString()} RBNT (~$${usd})`;
  if (rbnt) return `${rbnt.toLocaleString()} RBNT`;
  return `$${usd ?? 0}`;
};

export const getCategoryLabel = (cat: TaskCategory): string => ({
  developer: "Developer Work",
  design: "Design",
  research: "Research & Analysis",
  documentation: "Documentation",
  content: "Content & Community",
}[cat]);

// Developer and developer-documentation tasks list genuine technical requirements;
// design/research/content roles read more naturally as a "Scope of Work".
export const getRequirementsLabel = (cat: TaskCategory): string =>
  cat === "developer" || cat === "documentation" ? "Technical Requirements" : "Scope of Work";

// The full set of task statuses, in display order. Shared by the admin Tasks tab and the reviewer page's admin status control so they never drift.
export const TASK_STATUSES: Task["status"][] = ["open", "assigned", "in_progress", "completed", "paused"];

export const getStatusLabel = (status: Task["status"]): string => ({
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  paused: "Paused",
}[status]);

// Total submissions a single user may create per cycle, across all tasks combined
// (not per task, see `maxSubmissions`/`submissionCount` for that).
// Admins never submit at all, so there is no entry for that role.
export const SUBMISSION_CYCLE_CAP: Record<"reviewer" | "contributor", number> = {
  reviewer: 2,
  contributor: 4,
};

// Shorten a wallet for display: 0x1234...abcd
export const shortWallet = (a?: string) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

// Preferred human label for a person: their profile username, else their Discord handle, else a shortened wallet.
// Names are stored alongside wallets at write time (submissions, review locks)
// so reviewers never need to read other users' docs (which Firestore rules forbid).
export const displayName = (username?: string, discordHandle?: string, wallet?: string): string =>
  (username && username.trim()) || (discordHandle && discordHandle.trim()) || shortWallet(wallet);

// Submission review lifecycle.
// Kept in one place so the reviewer queue and the admin Submissions tab use the exact same words for the same state.
export type SubmissionStatus =
  | "under_review"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "withdrawn";

// Days a contributor has to resubmit after a revision is requested.
// Auto-set on the submission the moment a reviewer chooses "Revision Requested".
export const REVISION_DAYS = 5;

// Cycle 2 vocabulary (B3). "Approved" read as "you're getting paid", which is false in a one-winner-per-task model.
// We keep `approved` as the stored value (no data migration) but relabel it "Shortlisted":
// cleared the bar, in contention. The winning submission on a completed task becomes "Selected",
// the others "Not selected" (see getOutcomeLabel).
// Colours come from the shared `badge-<status>` classes in globals.css.
export const getSubmissionStatusLabel = (status?: string, revisionCount?: number): string => {
  // A submission that has been through at least one revision round and is back under review reads as a re-review,
  // not a fresh "awaiting review".
  if (status === "under_review" && (revisionCount ?? 0) > 0) return "Revised: awaiting re-review";
  return {
    under_review: "Awaiting review",
    approved: "Shortlisted",
    rejected: "Rejected",
    revision_requested: "Revision requested",
    withdrawn: "Withdrawn",
  }[status ?? ""] ?? (status ?? "").replace(/_/g, " ");
};

// Rulebook s05: every genuine submission is guaranteed at least one revision before it can be rejected.
// A first-round rejection (no revisionHistory yet, i.e. never resubmitted) must cite one of these four;
// a post-revision rejection needs no reason and defaults to "below_bar".
// "revision_deadline_missed" is stamped by the cron sweep (app/api/cron/sweep), never chosen by a reviewer.
export type RejectionReason = "plagiarism" | "empty" | "off_scope" | "rule_violation" | "below_bar" | "revision_deadline_missed";

export const FIRST_ROUND_REJECTION_REASONS: { value: RejectionReason; label: string }[] = [
  { value: "plagiarism", label: "Plagiarism" },
  { value: "empty", label: "Empty submission" },
  { value: "off_scope", label: "Off scope" },
  { value: "rule_violation", label: "Rule violation" },
];

export const getRejectionReasonLabel = (reason?: string | null): string => ({
  plagiarism: "Plagiarism",
  empty: "Empty submission",
  off_scope: "Off scope",
  rule_violation: "Rule violation",
  below_bar: "Below the bar after revision",
  revision_deadline_missed: "Revision window lapsed",
}[reason ?? ""] ?? "");

// Where the caller knows whether a task is completed and which submission won,
// use this to resolve a shortlisted submission to its final outcome.
// `isWinner` is true only for the single payable winner (see pickWinner in lib/ledger).
export const getOutcomeLabel = (
  status: string | undefined,
  taskCompleted: boolean,
  isWinner: boolean,
): string => {
  if (status !== "approved") return getSubmissionStatusLabel(status);
  if (!taskCompleted) return "Shortlisted";
  return isWinner ? "Selected" : "Not selected";
};

// Badge class for an outcome. Selected reuses the green "approved" dot;
// Not selected gets a neutral dot so it never reads as a rejection.
export const getOutcomeBadgeClass = (
  status: string | undefined,
  taskCompleted: boolean,
  isWinner: boolean,
): string => {
  if (status !== "approved") return `badge-${status}`;
  if (!taskCompleted) return "badge-approved";
  return isWinner ? "badge-completed" : "badge-paused";
};

// The 7-criterion review rubric, shared by the reviewer detail page (editable)
// and the read-only rubric view (admin/reviewer looking at a decided review),
// so both always show the exact same wording for the same criterion.
export const RUBRIC_CRITERIA = [
  "Deliverable completeness: does the submission include everything listed in Required Deliverables?",
  "Quality Benchmarks met: does the submission satisfy each benchmark defined in the task spec?",
  "Technical accuracy: is the code, analysis, or content factually correct and free of critical errors?",
  "Documentation quality: is the companion documentation clear, complete, and deployment-ready?",
  "Test coverage / verification: are all claims, functions, or outputs verifiable and tested?",
  "Failure Criteria: does the submission avoid every defined failure condition?",
  "Overall standard: does the submission meet the bar expected for a paid, published deliverable?",
];

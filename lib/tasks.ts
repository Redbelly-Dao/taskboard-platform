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
  status: "open" | "assigned" | "in_progress" | "under_review" | "completed" | "paused";
  shortDescription: string;
  problem: string;
  deliverables: string[];
  qualityBenchmarks: string[];
  failureCriteria: string[];
  technicalRequirements?: string[];
  infrastructure?: string[];
  maxSubmissions?: number; // e.g. 5; editable by admin, defaults to 5
  submissionCount?: number; // public running total, so contributors see + are gated by the cap
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

export const getStatusLabel = (status: Task["status"]): string => ({
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  under_review: "Under Review",
  completed: "Completed",
  paused: "Paused",
}[status]);

// Shorten a wallet for display: 0x1234...abcd
export const shortWallet = (a?: string) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

// Preferred human label for a person: their profile username, else their Discord
// handle, else a shortened wallet. Names are stored alongside wallets at write
// time (submissions, review locks) so reviewers never need to read other users'
// docs (which Firestore rules forbid).
export const displayName = (username?: string, discordHandle?: string, wallet?: string): string =>
  (username && username.trim()) || (discordHandle && discordHandle.trim()) || shortWallet(wallet);

// Submission review lifecycle. Kept in one place so the reviewer queue and the
// admin Submissions tab use the exact same words for the same state.
export type SubmissionStatus =
  | "under_review"
  | "approved"
  | "rejected"
  | "revision_requested";

// A submission awaiting review is shown as "Awaiting review" to reviewers (clearer
// than "under review"); everything else keeps its plain status wording. The colour
// still comes from the shared `badge-<status>` classes in globals.css.
export const getSubmissionStatusLabel = (status?: string): string =>
  ({
    under_review: "Awaiting review",
    approved: "Approved",
    rejected: "Rejected",
    revision_requested: "Revision requested",
  }[status ?? ""] ?? (status ?? "").replace(/_/g, " "));

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

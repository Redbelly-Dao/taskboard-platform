import { Task } from "./tasks";

// Ledger status vocabulary: the "redo" that reflects how the board actually
// runs, auto-derived from a task's status plus its submissions. The admin can
// override it per task (ledger.status); otherwise this derived value shows.
export type LedgerStatus =
  | "open"
  | "in_progress"
  | "in_review"
  | "revision"
  | "approved"
  | "awaiting_payment"
  | "paid"
  | "paused"
  | "rejected";

export const LEDGER_STATUSES: LedgerStatus[] = [
  "open", "in_progress", "in_review", "revision",
  "approved", "awaiting_payment", "paid", "paused", "rejected",
];

export const getLedgerStatusLabel = (s: LedgerStatus | string): string => ({
  open: "Open",
  in_progress: "In Progress",
  in_review: "In Review",
  revision: "Revision",
  approved: "Approved",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  paused: "Paused",
  rejected: "Rejected",
}[s as LedgerStatus] ?? String(s).replace(/_/g, " "));

// The single payable submission for a task: the highest reviewTotalScore among
// approved submissions. A tie (multiple approved subs share the top score) is
// resolved by the admin-set `paymentWinner` flag; until then it's unresolved.
// Mirrors the payment gating shipped in the admin Payments work.
export function pickWinner(subsForTask: any[]): { winner: any | null; tie: boolean } {
  const approved = subsForTask.filter((s) => s.status === "approved");
  if (approved.length === 0) return { winner: null, tie: false };
  const scoreOf = (s: any) => s.reviewTotalScore ?? -1;
  const maxScore = Math.max(...approved.map(scoreOf));
  const top = approved.filter((s) => scoreOf(s) === maxScore);
  if (top.length === 1) return { winner: top[0], tie: false };
  const chosen = top.find((s) => s.paymentWinner);
  return chosen ? { winner: chosen, tie: false } : { winner: null, tie: true };
}

export function deriveLedgerStatus(task: Task, subsForTask: any[]): LedgerStatus {
  if (task.status === "paused") return "paused";
  const { winner } = pickWinner(subsForTask);
  if (task.status === "completed") {
    if (winner?.paymentProcessed) return "paid";
    return "awaiting_payment";
  }
  if (winner) return "approved"; // has an approved winner but task not completed yet
  if (subsForTask.some((s) => s.status === "revision_requested")) return "revision";
  if (subsForTask.some((s) => s.status === "under_review")) return "in_review";
  if (subsForTask.length > 0) {
    // submissions exist but none are live/approved: either all rejected, or in flux
    if (subsForTask.every((s) => s.status === "rejected")) return "rejected";
    return "in_progress";
  }
  return "open";
}

// Best available deliverable link for a submission.
export const deliverableLinkOf = (s: any): string =>
  (s?.githubLink || s?.liveLink || s?.publishedLink || s?.fileUrl || "").trim();

// Build the community-safe projection written to ledger/{taskId}. Never
// includes identities/wallets/emails. Admin overrides on the existing ledger
// doc (status, deliverableLink, payout, note, tx hash, dates) win over derived
// defaults.
export function ledgerProjection(task: Task, subsForTask: any[], existing: any = {}) {
  const { winner } = pickWinner(subsForTask);
  const derivedStatus = deriveLedgerStatus(task, subsForTask);
  return {
    taskId: task.id,
    taskNumber: task.number ?? 0,
    title: task.title ?? "",
    category: task.category ?? "",
    taskStatus: task.status, // real task lifecycle status; only "completed" tasks belong on the ledger

    cycle: winner?.cycle ?? existing.cycle ?? null,
    status: existing.statusOverride || derivedStatus,
    payoutRbnt: existing.payoutRbnt ?? task.rewardRbnt ?? null,
    payoutUsd: existing.payoutUsd ?? task.reward ?? null,
    deliverableLink: existing.deliverableLink || (winner ? deliverableLinkOf(winner) : ""),
    paidTxHash: existing.paidTxHash ?? "",
    usdtAmount: existing.usdtAmount ?? "",
    dueDate: existing.dueDate ?? "",
    assignedDate: existing.assignedDate ?? "",
    publicNote: existing.publicNote ?? "",
    paidAt: winner?.paymentProcessedAt ?? existing.paidAt ?? null,
  };
}

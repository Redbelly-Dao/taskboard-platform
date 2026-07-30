// Deletion on request (T&Cs cl 4.4). A contributor may ask for a non-selected submission to be removed,
// "unless an appeal, dispute or investigation involving it is open, in which case it is deleted once that closes".
//
// Modelled on appeals: the doc id IS the submission id, which enforces one open request per submission for free.
// A request, not a self-service delete, because the file also has to come out of storage and because a paid
// submission must never leave the record. Firestore rules already refuse to delete anything with
// paymentProcessed, so the destructive half stays admin-only and doubly guarded.

export type DeletionRequestStatus = "open" | "completed" | "declined";

export interface DeletionRequest {
  id: string; // == submissionId
  submissionId: string;
  contributorId: string;
  walletAddress?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  reason?: string | null;
  status: DeletionRequestStatus;
  createdAt?: unknown;
  decidedAt?: unknown;
  decidedBy?: string | null;
  declineReason?: string | null;
}

export const DELETION_REASON_MAX = 500;

// Why a submission cannot be requested for deletion yet. Null means it can.
// Kept as one function so the contributor button, the admin view and any future server path agree.
export function deletionBlockedReason(sub: {
  status?: string;
  paymentProcessed?: boolean;
  paymentWinner?: boolean;
}, hasOpenAppeal: boolean): string | null {
  if (sub.paymentProcessed || sub.paymentWinner) {
    return "This submission was selected and paid, so it stays on the record. Rights transferred on payment.";
  }
  if (sub.status === "under_review") {
    return "This submission is still being reviewed. You can request deletion once a decision has landed.";
  }
  if (sub.status === "revision_requested") {
    return "A revision is open on this submission. Resubmit or let the window close first.";
  }
  if (hasOpenAppeal) {
    return "You have an open appeal on this submission. It can be deleted once the appeal is decided.";
  }
  return null;
}

export const getDeletionStatusLabel = (status?: string): string =>
  ({ open: "Open", completed: "Deleted", declined: "Declined" }[status || ""] || "Unknown");

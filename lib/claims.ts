// Slot reservations (B6).
// Claiming a task holds one of its submission slots for a few days, so nobody is beaten to it mid-work.
// Claims live at tasks/{taskId}/claims/{uid}; each user owns exactly one.

import { Cycle } from "./cycle";

export const CLAIM_DAYS = 5;

export interface Claim {
  uid: string;
  wallet?: string;
  name?: string;
  claimedAt?: unknown;
  expiresAt: number; // epoch ms
}

// A claim reserves a slot until it expires.
// It also never outlives the cycle's submission freeze (can't hold a slot into a window where nobody can submit).
export function claimExpiry(cycle?: Cycle | null, now: number = Date.now()): number {
  const base = now + CLAIM_DAYS * 86_400_000;
  const freeze = cycle?.freezeAt ? new Date(`${cycle.freezeAt}T23:59:59`).getTime() : null;
  return freeze != null ? Math.min(base, freeze) : base;
}

export const isClaimActive = (c: Claim, now: number = Date.now()): boolean =>
  typeof c.expiresAt === "number" && c.expiresAt > now;

// Slots taken = live submissions (submissionCount) + active reservations, minus your own claim
// (it's your slot, so it doesn't count against you).
export function slotsRemaining(
  maxSubmissions: number,
  submissionCount: number,
  activeClaims: Claim[],
  myUid?: string,
): number {
  const reservedByOthers = activeClaims.filter((c) => c.uid !== myUid).length;
  return Math.max(0, maxSubmissions - submissionCount - reservedByOthers);
}

// Rights agreement (B4). At submission the contributor signs this with their wallet.
// Rights transfer only on payment (a non-winner grants nothing), so the signature is a pre-commitment.
// The text + version are published here and stored on the submission alongside the signature,
// so anyone can verify what was agreed.
//
// DRAFT: pending counsel review before Cycle 2.
// Per the Redbelly team (Alison, 11 Jul), the model is FULL ASSIGNMENT to Redbelly Network Pty Ltd
// (not a licence to the DAO), embedded in participation T&Cs, with moral-rights consent.
// The template wording below reflects that position but the final text is being reviewed;
// do not wire live signing until it is signed off, then bump the version.
// Full participation T&Cs draft: resource-documents/09. Participation T&Cs (DRAFT).md

export const RIGHTS_VERSION = "2026-07-draft";

export const RIGHTS_ASSIGNEE = "Redbelly Network Pty Ltd";

export const RIGHTS_AGREEMENT = `Redbelly DAO Community Task Board: Submission Rights Agreement (${RIGHTS_VERSION})

By signing, I confirm that:
1. The work I am submitting is my own original work and does not infringe anyone else's rights.
2. It is a good-faith attempt at this task.
3. If my submission is selected and I am paid, I assign to ${RIGHTS_ASSIGNEE} all right, title and interest in the work, including all intellectual property rights, absolutely and worldwide.
4. I consent to ${RIGHTS_ASSIGNEE} and its licensees using, modifying, adapting and publishing the work, and I consent to any acts that would otherwise infringe my moral rights in it.
5. Assignment takes effect only upon payment. If my submission is not selected, no rights transfer and I keep my work.
6. I agree to be credited under the name I provide, and that the DAO's brand, not mine, is the centrepiece of any published version.`;

// The exact message handed to personal_sign. Deterministic, so it can be recovered and verified later.
export function buildRightsMessage(params: {
  taskId: string;
  wallet: string;
  creditName: string;
  timestamp: string; // ISO
}): string {
  return [
    RIGHTS_AGREEMENT,
    "",
    `Task: ${params.taskId}`,
    `Wallet: ${params.wallet}`,
    `Credit name: ${params.creditName}`,
    `Signed: ${params.timestamp}`,
    `Agreement version: ${RIGHTS_VERSION}`,
  ].join("\n");
}

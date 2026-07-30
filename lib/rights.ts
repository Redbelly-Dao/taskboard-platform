// Rights agreement (B4). At submission the contributor signs this with their registered wallet.
// Rights transfer only on payment (a non-winner grants nothing), so the signature is a pre-commitment.
// The text + version are published here and stored on the submission alongside the signature,
// so anyone can verify what was agreed.
//
// LIVE from Cycle 2. Approved by Redbelly (Alison Lewis, 15 and 21 Jul 2026): full assignment to
// Redbelly Network Pty Ltd (ABN 32 640 415 069), embedded in the participation T&Cs, with moral rights consent.
// Assign-on-payment was kept deliberately over present assignment: most submissions are never selected,
// and taking ownership of every submission at submission creates cleanup and fairness problems.
//
// Non-selected work is RETAINED on the board record, not deleted (Njay, 30 Jul 2026), and is never used,
// published or distributed. Point 5 below says so in the contributor's own words because it is the thing
// they most need to be able to rely on.
// Full participation T&Cs: /terms, source at resource-documents/09. Participation T&Cs.md

export const RIGHTS_VERSION = "2026-07";

export const RIGHTS_ASSIGNEE = "Redbelly Network Pty Ltd";

export const RIGHTS_ASSIGNEE_ABN = "32 640 415 069";

export const RIGHTS_AGREEMENT = `Redbelly DAO Community Task Board: Submission Rights Agreement (${RIGHTS_VERSION})

By signing, I confirm that:
1. The work I am submitting is my own original work, it does not infringe anyone else's rights, and it is a good faith attempt at this task.
2. I have the right to assign it, and I am legally capable of doing so in my jurisdiction.
3. If my submission is selected and I am paid, I assign to ${RIGHTS_ASSIGNEE} (ABN ${RIGHTS_ASSIGNEE_ABN}), absolutely and worldwide, all right, title and interest in that work, including all intellectual property rights, for the full term of those rights.
4. To the extent permitted by the law of the jurisdiction in which I am resident, I consent to ${RIGHTS_ASSIGNEE}, its licensees and successors using, reproducing, adapting, editing, adding to, combining and publishing that work, with or without attribution and in any media, and to acts that would otherwise infringe my moral rights in it.
5. Assignment takes effect only upon payment. If my submission is not selected, no rights transfer, I keep my work, and it will not be used, published or distributed. It stays on the board record for appeals and audit, and I can ask for it to be deleted.
6. I understand that others work on the same task, that similar submissions are expected, and that publishing the selected work is not a breach of point 5 merely because my submission resembles it.
7. I agree to be credited under the name I provide, and that the DAO's brand, not mine, is the centrepiece of any published version.
8. I have read and agree to the participation Terms and Conditions, which these confirmations form part of.`;

// Cycle 1 backfill. Six submissions were selected and PAID before any signing step existed, and no
// agreement was signed on paper either, so there is currently no assignment behind six published deliverables.
//
// This is a present assignment, not a confirmation of an earlier one, because there was no earlier one to
// confirm. It is expressed as taking effect from the payment date so the record matches what actually
// happened, and it names the payment already received as the consideration, since no fresh consideration
// passes at signing.
//
// Kept as its own version rather than reusing 2026-07: that text is written forward looking ("if my
// submission is selected and I am paid"), which is false for work already paid, and T&Cs cl 12.2 says
// versions do not apply retrospectively to work already submitted.
export const RIGHTS_VERSION_CYCLE1 = "2026-07-c1";

export const RIGHTS_AGREEMENT_CYCLE1 = `Redbelly DAO Community Task Board: Cycle 1 Rights Assignment (${RIGHTS_VERSION_CYCLE1})

This covers work I submitted before the board had a signing step. By signing, I confirm that:
1. I submitted the work identified below to the Redbelly DAO Community Task Board, it is my own original work, it does not infringe anyone else's rights, and I have the right to assign it.
2. That submission was selected and I have been paid for it.
3. I assign to ${RIGHTS_ASSIGNEE} (ABN ${RIGHTS_ASSIGNEE_ABN}), absolutely and worldwide, all right, title and interest in that work, including all intellectual property rights, for the full term of those rights.
4. This assignment takes effect from the date I was paid. The payment I have already received is the consideration for it.
5. To the extent permitted by the law of the jurisdiction in which I am resident, I consent to ${RIGHTS_ASSIGNEE}, its licensees and successors using, reproducing, adapting, editing, adding to, combining and publishing that work, with or without attribution and in any media, and to acts that would otherwise infringe my moral rights in it.
6. I agree to be credited under the name I provide, and that the DAO's brand, not mine, is the centrepiece of any published version.
7. I am signing with the wallet that received the payment.
8. I have read and agree to the participation Terms and Conditions.`;

// The exact message handed to personal_sign. Deterministic, so it can be recovered and verified later.
export function buildRightsMessage(params: {
  taskId: string;
  wallet: string;
  creditName: string;
  timestamp: string; // ISO
  cycle1?: boolean;
}): string {
  return [
    params.cycle1 ? RIGHTS_AGREEMENT_CYCLE1 : RIGHTS_AGREEMENT,
    "",
    `Task: ${params.taskId}`,
    `Wallet: ${params.wallet.toLowerCase()}`,
    `Credit name: ${params.creditName}`,
    `Signed: ${params.timestamp}`,
    `Agreement version: ${params.cycle1 ? RIGHTS_VERSION_CYCLE1 : RIGHTS_VERSION}`,
  ].join("\n");
}

// What gets stored on the submission. Kept in one place so the submit flow, the admin view and any later
// verification script all agree on the field names.
export interface RightsRecord {
  rightsVersion: string;
  rightsMessage: string;
  rightsSignature: string;
  rightsSignedAt: string;
  rightsWallet: string;
  creditName: string;
}

// The credit name is published on the ledger, so it is the one piece of this the contributor picks freely.
// Bounded so it cannot be used as a free text billboard on a public page.
export const CREDIT_NAME_MAX = 40;

export function creditNameError(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Enter the name you want credited.";
  if (trimmed.length > CREDIT_NAME_MAX) return `Keep the credit name under ${CREDIT_NAME_MAX} characters.`;
  return "";
}

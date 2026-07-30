"use client";

// The signing step required by T&Cs cl 8.1: at submission the contributor signs the rights agreement
// with their REGISTERED wallet, capturing the version, task, credit name, address and timestamp.
//
// Two rules this enforces and the submit form relies on:
//   1. The signature must come from the wallet on the profile. A different connected wallet is refused
//      outright, otherwise the record proves nothing about who agreed.
//   2. The signature is recovered and checked here before it is accepted, so an honest mistake
//      (wrong account selected in the wallet) fails now rather than becoming a bad record.
//      Everything needed to re-verify offline later is stored on the submission.

import { useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import type { Connector } from "wagmi";
import { buildRightsMessage, creditNameError, CREDIT_NAME_MAX, RIGHTS_AGREEMENT, RIGHTS_AGREEMENT_CYCLE1, RIGHTS_VERSION, RIGHTS_VERSION_CYCLE1, type RightsRecord } from "@/lib/rights";
import { verifyWalletSignature } from "@/lib/auth-utils";
import Link from "next/link";

export default function RightsSignature({
  taskId,
  wallet,
  defaultCreditName,
  value,
  onChange,
  cycle1 = false,
}: {
  taskId: string;
  wallet: string;
  defaultCreditName: string;
  value: RightsRecord | null;
  onChange: (record: RightsRecord | null) => void;
  // Cycle 1 backfill: work already selected and paid, assigned now with effect from the payment date.
  // Different text and a different version, because the standard one is written forward looking.
  cycle1?: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [creditName, setCreditName] = useState(defaultCreditName);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Same dedupe as the login page: EIP-6963 discovery plus the injected fallback can produce a duplicate
  // generic "Injected" entry.
  const named = connectors.filter((c) => c.name !== "Injected");
  const base = named.length > 0 ? named : connectors;
  const seen = new Set<string>();
  const walletOptions = base.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const registered = wallet.toLowerCase();
  const connectedMatches = isConnected && (address || "").toLowerCase() === registered;

  const sign = async (connector?: Connector) => {
    setError("");
    const nameError = creditNameError(creditName);
    if (nameError) {
      setError(nameError);
      return;
    }
    setBusy(true);
    try {
      let signer = (address || "").toLowerCase();
      if (connector) {
        const { accounts } = await connectAsync({ connector });
        signer = (accounts[0] || "").toLowerCase();
      }
      if (!signer) throw new Error("NO_ACCOUNT");
      if (signer !== registered) throw new Error("WRONG_WALLET");

      const timestamp = new Date().toISOString();
      const message = buildRightsMessage({ taskId, wallet: registered, creditName: creditName.trim(), timestamp, cycle1 });
      const signature = await signMessageAsync({ account: signer as `0x${string}`, message });

      const ok = await verifyWalletSignature(message, signature, registered);
      if (!ok) throw new Error("VERIFY_FAILED");

      onChange({
        rightsVersion: cycle1 ? RIGHTS_VERSION_CYCLE1 : RIGHTS_VERSION,
        rightsMessage: message,
        rightsSignature: signature,
        rightsSignedAt: timestamp,
        rightsWallet: registered,
        creditName: creditName.trim(),
      });
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      if (e?.message === "WRONG_WALLET") {
        setError(`Your wallet is on a different account. Switch to ${short(registered)}, the address registered to this profile, and sign again.`);
      } else if (e?.message === "NO_ACCOUNT") {
        setError("No account came back from the wallet. Unlock it and try again.");
      } else if (e?.message === "VERIFY_FAILED") {
        setError("That signature did not verify against your registered wallet. Nothing was recorded. Please try again.");
      } else {
        setError(e?.shortMessage || e?.message || "Signing failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <div className="border border-outline-variant rounded p-3 bg-surface-container-low">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ok font-semibold">Rights agreement signed</p>
            <p className="text-xs text-outline mt-1">
              Credited as <span className="text-on-surface font-semibold">{value.creditName}</span>, version{" "}
              <span className="mono">{value.rightsVersion}</span>, signed by {short(value.rightsWallet)}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-outline hover:text-primary shrink-0"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-outline-variant rounded p-3">
      <p className="text-xs text-primary font-semibold mb-1">Rights and credit</p>
      {cycle1 ? (
        <p className="text-xs text-outline leading-relaxed mb-3">
          This task was selected and paid before the board had a signing step, so there is no rights record for it.
          Signing assigns the rights in that work, with effect from the date you were paid. Nothing about your
          payment changes.{" "}
          <Link href="/terms" target="_blank" className="text-primary hover:underline">Read the full terms</Link>.
        </p>
      ) : (
        <p className="text-xs text-outline leading-relaxed mb-3">
          Sign this with your wallet to submit. Rights transfer only if your submission is selected and you are paid.
          If it is not selected, nothing transfers, you keep your work, and it will not be used.{" "}
          <Link href="/terms" target="_blank" className="text-primary hover:underline">Read the full terms</Link>.
        </p>
      )}

      <label className="label" htmlFor="credit-name">Credit name</label>
      <input
        id="credit-name"
        value={creditName}
        onChange={(e) => setCreditName(e.target.value)}
        maxLength={CREDIT_NAME_MAX}
        className="input"
        placeholder="The name you want credited"
      />
      <p className="text-xs text-outline mt-1 mb-3">Shown on the public ledger if you win. Your wallet is never published.</p>

      <button
        type="button"
        onClick={() => setShowTerms((v) => !v)}
        className="text-xs text-primary hover:underline mb-2"
      >
        {showTerms ? "Hide what you are signing" : "Read what you are signing"}
      </button>
      {showTerms && (
        <pre className="text-[11px] text-outline whitespace-pre-wrap leading-relaxed border border-outline-variant rounded p-2 mb-3 max-h-56 overflow-y-auto">
          {cycle1 ? RIGHTS_AGREEMENT_CYCLE1 : RIGHTS_AGREEMENT}
        </pre>
      )}

      {error && <p className="text-xs text-error mb-2">{error}</p>}

      {connectedMatches ? (
        <button type="button" onClick={() => sign()} disabled={busy} className="btn-primary text-xs">
          {busy ? "Waiting for your wallet…" : "Sign with wallet"}
        </button>
      ) : (
        <div>
          <p className="text-xs text-outline mb-2">
            Connect {short(registered)} to sign. This is the wallet registered to your account.
          </p>
          <div className="flex flex-wrap gap-2">
            {walletOptions.length === 0 && <p className="text-xs text-error">No wallet detected in this browser.</p>}
            {walletOptions.map((c) => (
              <button key={c.uid} type="button" onClick={() => sign(c)} disabled={busy} className="btn-secondary text-xs">
                {busy ? "Waiting…" : `Connect ${c.name}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

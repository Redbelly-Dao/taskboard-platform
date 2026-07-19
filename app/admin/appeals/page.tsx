"use client";
import { useState } from "react";
import Link from "next/link";
import { Appeal, criterionShortLabel, getAppealStatusLabel, getAppealTypeLabel } from "@/lib/appeals";
import { useAdmin } from "@/app/admin/AdminProvider";

export default function AppealsTab() {
  const { openAppeals, decidedAppeals } = useAdmin();
  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="px-4 py-3" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
          <p className="text-on-surface font-semibold text-sm">Open Appeals ({openAppeals.length})</p>
        </div>
        <div className="p-4 space-y-4">
          {openAppeals.length === 0 && (
            <p className="text-sm text-outline text-center py-8">No open appeals.</p>
          )}
          {openAppeals.map((a) => <AppealCard key={a.id} appeal={a} />)}
        </div>
      </div>

      {decidedAppeals.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
            <p className="text-on-surface font-semibold text-sm">Decided ({decidedAppeals.length})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                  <th className="text-left px-4 py-3 font-semibold">Task</th>
                  <th className="text-left px-4 py-3 font-semibold">Contributor</th>
                  <th className="text-left px-4 py-3 font-semibold">Type</th>
                  <th className="text-left px-4 py-3 font-semibold">Criterion</th>
                  <th className="text-left px-4 py-3 font-semibold">Outcome</th>
                  <th className="text-left px-4 py-3 font-semibold">Co-signer</th>
                  <th className="text-left px-4 py-3 font-semibold">Decided</th>
                </tr>
              </thead>
              <tbody>
                {decidedAppeals.map((a, i) => (
                  <tr key={a.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                    <td className="px-4 py-3 text-xs align-top">
                      <Link href={`/reviewer/${a.submissionId}`} className="mono text-primary font-semibold hover:underline">{a.taskId}</Link>
                      <p className="text-outline mt-0.5 max-w-[200px] truncate">{a.taskTitle}</p>
                    </td>
                    <td className="px-4 py-3 text-xs align-top text-on-surface">{a.contributorName}</td>
                    <td className="px-4 py-3 text-xs align-top text-on-surface">{getAppealTypeLabel(a.type)}</td>
                    <td className="px-4 py-3 text-xs align-top text-on-surface">{criterionShortLabel(a.criterionIndex)}</td>
                    <td className="px-4 py-3 align-top"><span className={`badge-${a.status}`}>{getAppealStatusLabel(a.status)}</span></td>
                    <td className="px-4 py-3 text-xs align-top text-outline">{a.cosignedBy || "-"}</td>
                    <td className="px-4 py-3 text-xs align-top text-outline whitespace-nowrap">
                      {a.decidedAt?.toDate?.()?.toLocaleDateString() ?? (a.decidedAt?.seconds ? new Date(a.decidedAt.seconds * 1000).toLocaleDateString() : "-")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// One open appeal: statement, admin note, and the uphold / overturn decision.
// Overturn is gated behind a required High Council co-signer name.
function AppealCard({ appeal }: { appeal: Appeal }) {
  const { appealNotes, setAppealNote, decideAppeal } = useAdmin();
  const [showOverturn, setShowOverturn] = useState(false);
  const [cosignedBy, setCosignedBy] = useState("");
  const [reinstateAs, setReinstateAs] = useState<"approved" | "under_review">("approved");
  const [busy, setBusy] = useState(false);
  const note = appealNotes[appeal.id] ?? "";

  const uphold = async () => {
    setBusy(true);
    await decideAppeal(appeal, "upheld");
    setBusy(false);
  };

  const overturn = async () => {
    if (!cosignedBy.trim()) return;
    setBusy(true);
    await decideAppeal(appeal, "overturned", {
      cosignedBy,
      reinstateAs: appeal.type === "rejection" ? reinstateAs : undefined,
    });
    setBusy(false);
    setShowOverturn(false);
  };

  return (
    <div className="border border-surface-container-high rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <p className="text-sm font-semibold text-on-surface">
            <span className="mono">{appeal.taskId}</span> <span className="text-outline font-normal">· {appeal.taskTitle}</span>
          </p>
          <p className="text-xs text-outline mt-0.5">{appeal.contributorName} · {getAppealTypeLabel(appeal.type)}</p>
        </div>
        <Link href={`/reviewer/${appeal.submissionId}`} className="text-xs text-primary font-semibold hover:underline flex-shrink-0">
          View submission →
        </Link>
      </div>

      <div className="text-xs mb-2">
        <span className="text-outline">Criterion cited: </span>
        <span className="text-on-surface font-semibold">{criterionShortLabel(appeal.criterionIndex)}</span>
      </div>

      <div className="bg-surface-container-low rounded-lg p-3 mb-3">
        <p className="text-xs text-on-surface whitespace-pre-wrap leading-relaxed">{appeal.statement}</p>
      </div>
      <p className="text-[10px] text-outline mb-3">Filed {appeal.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}</p>

      <div className="mb-3">
        <label className="label">Admin note</label>
        <textarea
          className="input resize-none text-xs"
          rows={2}
          value={note}
          onChange={(e) => setAppealNote(appeal.id, e.target.value)}
          placeholder="Optional note, shared with the contributor once decided"
        />
      </div>

      {!showOverturn ? (
        <div className="flex gap-2 flex-wrap">
          <button onClick={uphold} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">
            {busy ? "Working…" : "Uphold"}
          </button>
          <button onClick={() => setShowOverturn(true)} disabled={busy} className="btn-primary text-xs px-3 py-1.5">
            Overturn
          </button>
        </div>
      ) : (
        <div className="space-y-3 bg-surface-container-low rounded-lg p-3">
          <div>
            <label className="label">High Council co-signer <span className="text-primary">*</span></label>
            <input
              className="input text-xs"
              value={cosignedBy}
              onChange={(e) => setCosignedBy(e.target.value)}
              placeholder="Co-signer name"
            />
          </div>

          {appeal.type === "rejection" ? (
            <div>
              <label className="label">Reinstate submission as</label>
              <div className="flex gap-2">
                {(["approved", "under_review"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setReinstateAs(s)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                      reinstateAs === s ? "bg-brand text-white" : "border border-outline-variant text-on-surface hover:border-brand"
                    }`}
                  >
                    {s === "approved" ? "Shortlisted" : "Under review"}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-outline">
              No automatic change to the submission. Use the Ledger tab&apos;s payment tools to act on this.
            </p>
          )}

          {!cosignedBy.trim() && <p className="text-xs text-error">A co-signer name is required to overturn.</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={overturn} disabled={busy || !cosignedBy.trim()} className="btn-primary text-xs px-3 py-1.5">
              {busy ? "Applying…" : "Confirm overturn"}
            </button>
            <button onClick={() => setShowOverturn(false)} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

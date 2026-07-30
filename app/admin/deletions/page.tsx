"use client";
import { useState } from "react";
import { useAdmin } from "@/app/admin/AdminProvider";
import { getDeletionStatusLabel } from "@/lib/deletion-requests";

// T&Cs cl 4.4: a contributor may ask for a non-selected submission to be deleted and it will be,
// unless an appeal or dispute involving it is open. Completing a request deletes the submission for real,
// so the confirm step names the task rather than asking a generic "are you sure".

export default function DeletionsTab() {
  const { deletionRequests, openDeletionRequests } = useAdmin();
  const decided = deletionRequests.filter((r) => r.status !== "open");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-on-surface mb-1">Deletion requests</h2>
        <p className="text-xs text-outline mb-4">
          Non-selected work only. A paid submission stays on the record and the request is declined
          automatically if one slips through.
        </p>
        <div className="space-y-3">
          {openDeletionRequests.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-sm text-outline">No open requests.</p>
            </div>
          )}
          {openDeletionRequests.map((r) => <RequestCard key={r.id} req={r} />)}
        </div>
      </div>

      {decided.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-on-surface mb-2">Decided</h3>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-outline">Task</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-outline">Outcome</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-outline">Reason given</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id} className="border-b border-outline-variant last:border-0">
                    <td className="px-4 py-3 text-xs">
                      <span className="mono text-on-surface">{r.taskId}</span>
                      <span className="text-outline"> {r.taskTitle}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface">{getDeletionStatusLabel(r.status)}</td>
                    <td className="px-4 py-3 text-xs text-outline">{r.declineReason || "-"}</td>
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

function RequestCard({ req }: { req: any }) {
  const { decideDeletionRequest } = useAdmin();
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (outcome: "completed" | "declined") => {
    setBusy(true);
    try {
      await decideDeletionRequest(req, outcome, declineReason);
    } finally {
      setBusy(false);
      setConfirming(false);
      setDeclining(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">
            <span className="mono text-xs text-primary">{req.taskId}</span> {req.taskTitle}
          </p>
          <p className="mono text-[11px] text-outline mt-1 break-all">{req.walletAddress}</p>
          {req.reason && <p className="text-xs text-on-surface mt-2 leading-relaxed">{req.reason}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => { setDeclining(true); setConfirming(false); }} className="btn-secondary text-xs">Decline</button>
          <button onClick={() => { setConfirming(true); setDeclining(false); }} className="btn-primary text-xs">Delete submission</button>
        </div>
      </div>

      {confirming && (
        <div className="mt-3 border-t border-outline-variant pt-3">
          <p className="text-xs text-error mb-2">
            This permanently deletes the submission for <span className="mono">{req.taskId}</span>, including its
            rubric scores and review history. It cannot be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(false)} className="btn-secondary text-xs">Cancel</button>
            <button onClick={() => run("completed")} disabled={busy} className="btn-primary text-xs">
              {busy ? "Deleting…" : "Yes, delete it"}
            </button>
          </div>
        </div>
      )}

      {declining && (
        <div className="mt-3 border-t border-outline-variant pt-3">
          <label className="label" htmlFor={`decline-${req.id}`}>Reason, shown to the contributor</label>
          <input
            id={`decline-${req.id}`}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            className="input text-xs"
            placeholder="Why this one stays on the record"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeclining(false)} className="btn-secondary text-xs">Cancel</button>
            <button onClick={() => run("declined")} disabled={busy || !declineReason.trim()} className="btn-primary text-xs">
              {busy ? "Saving…" : "Decline request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { getSubmissionStatusLabel, getRejectionReasonLabel } from "@/lib/tasks";
import { useAdmin, SUB_STATUS_OPTIONS } from "@/app/admin/AdminProvider";
import { ReviewClockBadge } from "@/components/reviewer/ReviewClockBadge";

export default function SubmissionsTab() {
  const { submissions, setAuditSub, setOverrideSub, setOverrideDecision, setOverrideFeedback, submissionSearch, setSubmissionSearch, submissionStatusFilter, setSubmissionStatusFilter, submissionCycleFilter, setSubmissionCycleFilter, submissionCyclesPresent, reviewerLabel, filteredSubmissions, goToReviewer } = useAdmin();
  return (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
              <p className="text-on-surface font-semibold text-sm">
                All Submissions ({filteredSubmissions.length}{filteredSubmissions.length !== submissions.length ? `/${submissions.length}` : ""})
              </p>
            </div>
            <div className="px-4 py-3 border-b border-surface-container-high flex gap-3 flex-wrap items-center bg-surface-slate">
              <input
                className="input text-xs flex-1 min-w-[200px]"
                placeholder="Search task ID, title, wallet, or Discord..."
                value={submissionSearch}
                onChange={(e) => setSubmissionSearch(e.target.value)}
              />
              <select
                className="text-xs border border-surface-container-high rounded-lg px-3 py-2 bg-surface-slate text-on-surface focus:outline-none focus:border-brand"
                value={submissionStatusFilter}
                onChange={(e) => setSubmissionStatusFilter(e.target.value)}
              >
                {SUB_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</option>
                ))}
              </select>
              {submissionCyclesPresent.length > 0 && (
                <select
                  className="text-xs border border-surface-container-high rounded-lg px-3 py-2 bg-surface-slate text-on-surface focus:outline-none focus:border-brand"
                  value={submissionCycleFilter}
                  onChange={(e) => setSubmissionCycleFilter(e.target.value)}
                >
                  <option value="all">All cycles</option>
                  {submissionCyclesPresent.map((c: number) => <option key={c} value={String(c)}>Cycle {c}</option>)}
                </select>
              )}
              {(submissionSearch || submissionStatusFilter !== "all" || submissionCycleFilter !== "all") && (
                <button
                  onClick={() => { setSubmissionSearch(""); setSubmissionStatusFilter("all"); setSubmissionCycleFilter("all"); }}
                  className="text-xs text-outline hover:text-on-surface transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                    <th className="text-left px-4 py-3 font-semibold">Task</th>
                    <th className="text-left px-4 py-3 font-semibold">Contributor</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Reviewer</th>
                    <th className="text-left px-4 py-3 font-semibold">Score</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Links</th>
                    <th className="text-left px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((sub, i) => (
                    <tr key={sub.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                      <td className="px-4 py-3">
                        <p className="mono text-xs font-semibold text-on-surface">
                          {sub.taskId}{typeof sub.cycle === "number" && <span className="text-outline font-normal"> · c{sub.cycle}</span>}
                        </p>
                        <p className="text-xs text-outline truncate max-w-[140px]">{sub.taskTitle}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="mono text-xs text-on-surface">{sub.walletAddress?.slice(0, 6)}…{sub.walletAddress?.slice(-4)}</p>
                        {sub.discordHandle && <p className="text-xs text-outline">{sub.discordHandle}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`badge-${sub.status}`}>{getSubmissionStatusLabel(sub.status, sub.revisionCount)}</span>
                          {sub.status === "rejected" && sub.rejectedReason && (
                            <span className="text-[10px] text-outline">{getRejectionReasonLabel(sub.rejectedReason)}</span>
                          )}
                          {sub.adminOverride && <span className="badge text-warn">overridden</span>}
                          {sub.paymentProcessed && <span className="badge text-ok">paid</span>}
                          <ReviewClockBadge sub={sub} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {sub.reviewingByWallet ? (
                          <button
                            onClick={() => { goToReviewer(sub.reviewingByWallet); }}
                            className="text-warn font-semibold hover:underline text-left"
                          >
                            {reviewerLabel(sub.reviewingByWallet)}
                            <span className="block text-[10px] font-normal text-warn">active now</span>
                          </button>
                        ) : sub.reviewerWallet ? (
                          <button
                            onClick={() => { goToReviewer(sub.reviewerWallet); }}
                            className="text-outline hover:text-primary hover:underline text-left"
                          >
                            {reviewerLabel(sub.reviewerWallet)}
                          </button>
                        ) : (
                          <span className="text-outline">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {sub.reviewTotalScore ? <span className="font-bold text-primary">{sub.reviewTotalScore}/35</span> : "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-outline">
                        {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {sub.githubLink && <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-semibold hover:underline">GitHub</a>}
                          {sub.liveLink && <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-semibold hover:underline">Live</a>}
                          {sub.fileUrl && <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-semibold hover:underline">File</a>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => setAuditSub(sub)}
                            className="text-xs text-primary font-semibold hover:underline text-left"
                          >
                            View
                          </button>
                          <button
                            onClick={() => { setOverrideSub(sub); setOverrideDecision(""); setOverrideFeedback(""); }}
                            className="text-xs text-outline font-semibold hover:text-primary transition-colors text-left"
                          >
                            Override
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSubmissions.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-outline">
                      {submissions.length === 0 ? "No submissions yet." : "No submissions match your filter."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
  );
}

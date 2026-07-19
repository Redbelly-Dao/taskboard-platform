"use client";
import { getSubmissionStatusLabel } from "@/lib/tasks";
import { useAdmin, RUBRIC_CRITERIA } from "@/app/admin/AdminProvider";
import SubmissionChat from "@/components/SubmissionChat";

export default function ReviewersTab() {
  const { setAuditSub, setOverrideSub, setOverrideDecision, setOverrideFeedback, selectedReviewer, setSelectedReviewer, expandedReviewSub, setExpandedReviewSub, activeReviews, reviewerStats, selectedReviewerSubs, reviewerLabel, forceReleaseLock } = useAdmin();
  return (
          <div className="space-y-6">
            {/* Currently Active Reviews */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${activeReviews.length > 0 ? "bg-ok animate-pulse" : "bg-outline"}`} />
                <p className="text-on-surface font-semibold text-sm">Currently Reviewing ({activeReviews.length}) <span className="text-outline text-xs">(admins can force-release stale locks)</span></p>
              </div>
              {activeReviews.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-outline">No active reviews right now.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                        <th className="text-left px-4 py-3 font-semibold">Reviewer Wallet</th>
                        <th className="text-left px-4 py-3 font-semibold">Task</th>
                        <th className="text-left px-4 py-3 font-semibold">Submitted By</th>
                        <th className="text-left px-4 py-3 font-semibold">Submission Date</th>
                        <th className="text-left px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeReviews.map((sub, i) => (
                        <tr key={sub.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn flex-shrink-0" />
                              <span className="text-xs font-semibold text-warn">
                                {reviewerLabel(sub.reviewingByWallet)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="mono text-xs font-semibold text-on-surface">{sub.taskId}</p>
                            <p className="text-xs text-outline truncate max-w-[160px]">{sub.taskTitle}</p>
                          </td>
                          <td className="px-4 py-3 mono text-xs text-outline">
                            {sub.walletAddress?.slice(0, 6)}...{sub.walletAddress?.slice(-4)}
                            {sub.discordHandle && <p className="text-outline">{sub.discordHandle}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-outline">
                            {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                          </td>
                          <td className="px-4 py-3 flex items-center gap-2">
                            <button
                              onClick={() => setAuditSub(sub)}
                              className="text-xs text-primary font-semibold hover:underline"
                            >
                              View
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); forceReleaseLock(sub.id); }}
                              className="text-xs text-error hover:underline"
                            >
                              Force release
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reviewer Stats */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
                <p className="text-on-surface font-semibold text-sm">All Reviewers ({reviewerStats.length})</p>
                <p className="text-outline text-xs mt-0.5">Click a row to inspect all their reviews</p>
              </div>
              {reviewerStats.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-outline">No completed reviews yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                        <th className="text-left px-4 py-3 font-semibold">Reviewer Wallet</th>
                        <th className="text-left px-4 py-3 font-semibold">Total</th>
                        <th className="text-left px-4 py-3 font-semibold">Approved</th>
                        <th className="text-left px-4 py-3 font-semibold">Revision</th>
                        <th className="text-left px-4 py-3 font-semibold">Rejected</th>
                        <th className="text-left px-4 py-3 font-semibold">Avg Score</th>
                        <th className="text-left px-4 py-3 font-semibold">Last Review</th>
                        <th className="text-left px-4 py-3 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewerStats.map((r, i) => (
                        <tr
                          key={r.wallet}
                          className={`border-b border-surface-container-high cursor-pointer transition-colors ${
                            selectedReviewer === r.wallet
                              ? "bg-surface-container-low"
                              : i % 2 === 1 ? "bg-surface-container-low hover:bg-surface-container-low" : "bg-surface-slate hover:bg-surface-container-low"
                          }`}
                          onClick={() => {
                            setSelectedReviewer(selectedReviewer === r.wallet ? null : r.wallet);
                            setExpandedReviewSub(null);
                          }}
                        >
                          <td className="px-4 py-3 text-xs font-semibold text-on-surface">
                            {reviewerLabel(r.wallet)}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-on-surface">{r.total}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-ok">{r.approved}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-warn">{r.revision}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-error">{r.rejected}</td>
                          <td className="px-4 py-3 text-xs">
                            {r.avgScore !== null
                              ? <span className="font-bold text-primary">{r.avgScore}/35</span>
                              : <span className="text-outline">-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-outline">
                            {r.lastReviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-primary">
                            {selectedReviewer === r.wallet ? "▲ Close" : "▼ Inspect"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reviewer Detail Panel (inline expansion) */}
            {selectedReviewer && (
              <div className="card overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
                  <div>
                    <p className="text-on-surface font-semibold text-sm">
                      Reviewer: <span>{reviewerLabel(selectedReviewer)}</span>
                    </p>
                    <p className="text-outline text-xs mt-0.5">{selectedReviewerSubs.length} review{selectedReviewerSubs.length !== 1 ? "s" : ""} completed</p>
                  </div>
                  <button onClick={() => { setSelectedReviewer(null); setExpandedReviewSub(null); }} className="text-outline hover:text-on-surface text-xl leading-none">×</button>
                </div>

                <div className="divide-y divide-surface-container-high">
                  {selectedReviewerSubs.map((sub) => {
                    const isExpanded = expandedReviewSub === sub.id;
                    return (
                      <div key={sub.id}>
                        {/* Summary row */}
                        <div
                          className={`px-4 py-4 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? "bg-surface-container-low" : "bg-surface-slate hover:bg-surface-container-low"}`}
                          onClick={() => setExpandedReviewSub(isExpanded ? null : sub.id)}
                        >
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="mono text-xs font-semibold text-on-surface">{sub.taskId}</p>
                              <p className="text-xs text-outline truncate max-w-[200px]">{sub.taskTitle}</p>
                            </div>
                            <span className={`badge-${sub.status}`}>{getSubmissionStatusLabel(sub.status)}</span>
                            {sub.adminOverride && <span className="badge text-warn">overridden</span>}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              {sub.reviewTotalScore ? (
                                <p className="text-sm font-bold text-primary">{sub.reviewTotalScore}/35</p>
                              ) : (
                                <p className="text-xs text-outline">no score</p>
                              )}
                              <p className="text-[10px] text-outline">{sub.reviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOverrideSub(sub); setOverrideDecision(""); setOverrideFeedback(""); }}
                              className="text-xs px-2 py-0.5 rounded border border-brand text-primary hover:bg-surface-container-low font-semibold"
                            >
                              Override
                            </button>
                            <span className="text-xs text-outline cursor-pointer">{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="bg-surface-container-low px-5 py-5 space-y-6">
                            {/* Contributor */}
                            <div className="text-xs space-y-1">
                              <p className="font-semibold text-outline uppercase tracking-wider mb-2">Contributor</p>
                              <p><span className="text-outline">Wallet: </span><span className="mono text-on-surface">{sub.walletAddress}</span></p>
                              {sub.discordHandle && <p><span className="text-outline">Discord: </span><span className="text-on-surface">{sub.discordHandle}</span></p>}
                              <div className="flex gap-3 pt-1">
                                {sub.githubLink && <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">GitHub →</a>}
                                {sub.liveLink && <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">Live →</a>}
                                {sub.fileUrl && <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">File →</a>}
                              </div>
                            </div>

                            {/* Rubric scores */}
                            {sub.reviewScores?.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-outline uppercase tracking-wider mb-3">Review Rubric</p>
                                <div className="space-y-2">
                                  {RUBRIC_CRITERIA.map((criterion, ci) => (
                                    <div key={ci} className="bg-surface-slate rounded-lg p-3 border border-surface-container-high">
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-semibold text-on-surface">{criterion}</p>
                                        <div className="flex items-center gap-1">
                                          {[1, 2, 3, 4, 5].map((s) => (
                                            <div key={s} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                                              sub.reviewScores[ci] === s ? "bg-brand text-on-surface" : "bg-surface-container-low text-outline"
                                            }`}>{s}</div>
                                          ))}
                                        </div>
                                      </div>
                                      {sub.reviewJustifications?.[ci] && (
                                        <p className="text-xs text-on-surface italic">{sub.reviewJustifications[ci]}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Required changes */}
                            {sub.requiredChanges && (
                              <div className="p-3 border  rounded-lg text-xs">
                                <p className="font-semibold text-warn mb-1">Required Changes</p>
                                <p className="text-warn whitespace-pre-line">{sub.requiredChanges}</p>
                                {sub.revisionDeadline && <p className="text-warn mt-1">Deadline: {sub.revisionDeadline}</p>}
                              </div>
                            )}

                            {/* Admin override */}
                            {sub.adminOverride && (
                              <div className="p-3 border  rounded-lg text-xs">
                                <p className="font-semibold text-warn mb-1">Admin Override Applied</p>
                                <p className="text-outline mb-0.5">By: <span className="mono text-on-surface">{sub.adminOverrideWallet}</span></p>
                                <p className="text-warn">{sub.adminOverrideFeedback}</p>
                              </div>
                            )}

                            {/* Chat */}
                            <div className="bg-surface-slate rounded-lg p-4 border border-surface-container-high">
                              <p className="text-xs font-semibold text-outline uppercase tracking-wider mb-3">Submission Chat</p>
                              <SubmissionChat
                                submissionId={sub.id}
                                taskId={sub.taskId}
                                taskTitle={sub.taskTitle}
                                contributorId={sub.contributorId}
                                reviewerId={sub.reviewerId}
                              />
                            </div>

                            {/* Admin override action */}
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); setOverrideSub(sub); setOverrideDecision(""); setOverrideFeedback(""); }}
                                className="btn-secondary text-xs"
                              >
                                Override Decision
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setAuditSub(sub); }}
                                className="btn-secondary text-xs"
                              >
                                Full Audit View
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
  );
}

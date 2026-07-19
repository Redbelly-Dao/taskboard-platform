"use client";
import { Fragment, useState } from "react";
import { getSubmissionStatusLabel, formatReward, displayName, Task } from "@/lib/tasks";
import { deriveLedgerStatus, pickWinner, deliverableLinkOf, getLedgerStatusLabel, LEDGER_STATUSES } from "@/lib/ledger";
import { useAdmin, LEDGER_STATUS_DOT } from "@/app/admin/AdminProvider";

export default function LedgerTab() {
  const { submissions, tasks, ledgerDocs, expandedLedger, setExpandedLedger, setPayConfirmId, subsForTask, saveLedgerField, publishAllLedger, choosePaymentWinner, exportAdminTracker, exportPublicLedger, ledgerTasks, scoreOf, payableWinners, tiedTasks, heldForCompletion, paidSubmissions, openAppealTaskIds } = useAdmin();
  const [cycleFilter, setCycleFilter] = useState("all");
  const winnerCycleOf = (taskId: string): number | undefined => pickWinner(subsForTask(taskId)).winner?.cycle;
  const cyclesPresent = Array.from(
    new Set(ledgerTasks.map((t: Task) => winnerCycleOf(t.id)).filter((c): c is number => typeof c === "number"))
  ).sort((a, b) => b - a);
  const visibleLedgerTasks = cycleFilter === "all"
    ? ledgerTasks
    : ledgerTasks.filter((t: Task) => String(winnerCycleOf(t.id) ?? "") === cycleFilter);
  return (
          <div>
            <div className="bg-surface-container-low border border-brand/20 rounded-xl p-4 mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-primary mb-1">Task Board Ledger</p>
                <p className="text-xs text-on-surface max-w-2xl">
                  The single source of truth for task status, winners, and payouts. Edits here publish straight to the
                  public transparency ledger at <span className="mono">/ledger</span> (community-facing, no identities).
                  Only the highest-scoring approved submission on a <span className="font-semibold">Completed</span> task is payable.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={publishAllLedger} className="btn-secondary text-xs px-3 py-1.5">Sync public ledger</button>
                <button onClick={exportAdminTracker} className="btn-ghost text-xs px-3 py-1.5 border border-surface-container-high rounded-lg">Admin Tracker CSV</button>
                <button onClick={exportPublicLedger} className="btn-ghost text-xs px-3 py-1.5 border border-surface-container-high rounded-lg">Public Ledger CSV</button>
              </div>
            </div>

            {heldForCompletion.length > 0 && (
              <div className="bg-surface-container-low border border-warn/30 rounded-lg p-3 mb-4 text-xs text-warn">
                {heldForCompletion.length} approved submission{heldForCompletion.length === 1 ? "" : "s"} held: their task is not marked Completed yet, so no winner is payable. Complete the task to release payment.
              </div>
            )}

            {tiedTasks.length > 0 && (
              <div className="card overflow-hidden mb-4 border border-warn/40">
                <div className="px-4 py-3" style={{ backgroundColor: "#854D0E" }}>
                  <p className="text-on-surface font-semibold text-sm">Ties to resolve ({tiedTasks.length})</p>
                </div>
                <div className="p-4 space-y-4">
                  {tiedTasks.map(({ taskId, subs }) => {
                  const recommendedId = tasks.find((t: Task) => t.id === taskId)?.recommendedWinnerId;
                  return (
                    <div key={taskId}>
                      <p className="text-xs font-semibold text-on-surface mb-2">
                        <span className="mono">{taskId}</span> has {subs.length} approved submissions tied at {scoreOf(subs[0])}/35. Pick the one to pay.
                      </p>
                      <div className="space-y-1.5">
                        {subs.map((sub: any) => (
                          <div key={sub.id} className="flex items-center justify-between gap-2 bg-surface-container-low rounded px-3 py-2">
                            <span className="text-xs text-on-surface truncate">
                              {displayName(sub.username, sub.discordHandle, sub.walletAddress)}
                              <span className="text-outline mono ml-2">{sub.walletAddress?.slice(0, 6)}...{sub.walletAddress?.slice(-4)}</span>
                              {sub.id === recommendedId && <span className="text-primary font-semibold ml-2">reviewer recommended</span>}
                            </span>
                            <button onClick={() => choosePaymentWinner(taskId, sub.id)} className="btn-primary text-xs px-3 py-1 shrink-0">Pay this one</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}

            <div className="card overflow-hidden mb-4">
              <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
                <p className="text-on-surface font-semibold text-sm">Ledger ({visibleLedgerTasks.length} completed task{visibleLedgerTasks.length === 1 ? "" : "s"})</p>
                {cyclesPresent.length > 0 && (
                  <select
                    className="text-xs border border-surface-container-high rounded-lg px-2 py-1 bg-surface-slate text-on-surface focus:outline-none focus:border-brand"
                    value={cycleFilter}
                    onChange={(e) => setCycleFilter(e.target.value)}
                  >
                    <option value="all">All cycles</option>
                    {cyclesPresent.map((c: number) => <option key={c} value={String(c)}>Cycle {c}</option>)}
                  </select>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                      <th className="text-left px-4 py-3 font-semibold">Task</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Winner</th>
                      <th className="text-left px-4 py-3 font-semibold">Rubric</th>
                      <th className="text-left px-4 py-3 font-semibold">Contributor Pay</th>
                      <th className="text-left px-4 py-3 font-semibold">Reviewer Pay</th>
                      <th className="text-left px-4 py-3 font-semibold">Deliverable Link</th>
                      <th className="text-left px-4 py-3 font-semibold">Payment TX</th>
                      <th className="text-left px-4 py-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLedgerTasks.map((task, i) => {
                      const subs = subsForTask(task.id);
                      const { winner } = pickWinner(subs);
                      const recommendedSub = task.recommendedWinnerId ? subs.find((s: any) => s.id === task.recommendedWinnerId) : null;
                      const led = ledgerDocs[task.id] || {};
                      const status = led.statusOverride || deriveLedgerStatus(task, subs);
                      const reviewerRbnt = task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined;
                      const expanded = expandedLedger === task.id;
                      // Payment hold (rulebook 09): an open appeal on this task blocks payout.
                      const appealHold = openAppealTaskIds.has(task.id);
                      const canPay = winner && task.status === "completed" && !winner.paymentProcessed && !appealHold;
                      return (
                        <Fragment key={task.id}>
                          <tr className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                            <td className="px-4 py-3 mono text-xs font-semibold text-on-surface">{task.id}{winner?.cycle != null && <span className="ml-1 text-[10px] text-outline">c{winner.cycle}</span>}</td>
                            <td className="px-4 py-3"><span className="inline-flex items-center gap-2 mono text-[11px] text-on-surface whitespace-nowrap"><span className={`w-1.5 h-1.5 rounded-full flex-none ${LEDGER_STATUS_DOT[status] || "bg-outline"}`} />{getLedgerStatusLabel(status)}</span></td>
                            <td className="px-4 py-3 text-xs text-on-surface">
                              {winner ? <span title={winner.walletAddress}>{displayName(winner.username, winner.discordHandle, winner.walletAddress)}</span> : <span className="text-outline">-</span>}
                              {recommendedSub && (
                                <p
                                  className={`text-[10px] mt-0.5 ${recommendedSub.id !== winner?.id ? "text-warn" : "text-outline"}`}
                                  title={task.winnerRecommendationNote || ""}
                                >
                                  Reviewer recommends: {displayName(recommendedSub.username, recommendedSub.discordHandle, recommendedSub.walletAddress)} ({recommendedSub.reviewTotalScore}/35)
                                  {recommendedSub.id !== winner?.id && " · differs from top score"}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs">{winner?.reviewTotalScore != null ? <span className="font-bold text-primary">{winner.reviewTotalScore}/35</span> : <span className="text-outline">-</span>}</td>
                            <td className="px-4 py-3 text-xs font-semibold text-on-surface">{formatReward(task.rewardRbnt, task.reward)}</td>
                            <td className="px-4 py-3 text-xs text-outline">{task.reviewerComp ? formatReward(reviewerRbnt, task.reviewerComp) : "N/A"}</td>
                            <td className="px-4 py-3">
                              <input
                                defaultValue={led.deliverableLink || (winner ? deliverableLinkOf(winner) : "")}
                                onBlur={(e) => { if (e.target.value !== (led.deliverableLink || (winner ? deliverableLinkOf(winner) : ""))) saveLedgerField(task.id, "deliverableLink", e.target.value.trim()); }}
                                placeholder="deliverable URL"
                                className="w-40 text-xs border border-surface-container-high rounded px-2 py-1 bg-surface-slate focus:outline-none focus:border-brand"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                defaultValue={led.paidTxHash || ""}
                                onBlur={(e) => { if (e.target.value !== (led.paidTxHash || "")) saveLedgerField(task.id, "paidTxHash", e.target.value.trim()); }}
                                placeholder="0x..."
                                className="w-32 text-xs mono border border-surface-container-high rounded px-2 py-1 bg-surface-slate focus:outline-none focus:border-brand"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {canPay && <button onClick={() => setPayConfirmId(winner.id)} className="text-xs text-ok font-semibold hover:text-ok mr-3">Mark Paid</button>}
                              {winner?.paymentProcessed && <span className="text-xs text-ok font-semibold mr-3">Paid ✓</span>}
                              {!winner?.paymentProcessed && appealHold && (
                                <span className="mono text-[10px] text-warn font-semibold mr-3" title="An open appeal on this task holds payment.">Appeal open</span>
                              )}
                              <button onClick={() => setExpandedLedger(expanded ? null : task.id)} className="text-xs text-outline hover:text-primary">{expanded ? "Close" : "Edit"}</button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-surface-container-low border-b border-surface-container-high">
                              <td colSpan={9} className="px-4 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                  <label className="text-xs text-on-surface">Status override
                                    <select defaultValue={led.statusOverride || ""} onChange={(e) => saveLedgerField(task.id, "statusOverride", e.target.value)} className="mt-1 w-full text-xs border border-surface-container-high rounded px-2 py-1 bg-surface-slate">
                                      <option value="">Auto ({getLedgerStatusLabel(deriveLedgerStatus(task, subs))})</option>
                                      {LEDGER_STATUSES.map((s) => <option key={s} value={s}>{getLedgerStatusLabel(s)}</option>)}
                                    </select>
                                  </label>
                                  <label className="text-xs text-on-surface">USDT amount
                                    <input defaultValue={led.usdtAmount || ""} onBlur={(e) => saveLedgerField(task.id, "usdtAmount", e.target.value.trim())} className="mt-1 w-full text-xs border border-surface-container-high rounded px-2 py-1 bg-surface-slate" />
                                  </label>
                                  <label className="text-xs text-on-surface">Assigned date
                                    <input type="date" defaultValue={led.assignedDate || ""} onBlur={(e) => saveLedgerField(task.id, "assignedDate", e.target.value)} className="mt-1 w-full text-xs border border-surface-container-high rounded px-2 py-1 bg-surface-slate" />
                                  </label>
                                  <label className="text-xs text-on-surface">Due date
                                    <input type="date" defaultValue={led.dueDate || ""} onBlur={(e) => saveLedgerField(task.id, "dueDate", e.target.value)} className="mt-1 w-full text-xs border border-surface-container-high rounded px-2 py-1 bg-surface-slate" />
                                  </label>
                                </div>
                                <label className="text-xs text-on-surface block mb-3">Public note (shown on the community ledger)
                                  <input defaultValue={led.publicNote || ""} onBlur={(e) => saveLedgerField(task.id, "publicNote", e.target.value)} placeholder="e.g. paid in batch 2" className="mt-1 w-full text-xs border border-surface-container-high rounded px-2 py-1 bg-surface-slate" />
                                </label>
                                <p className="text-[10px] uppercase tracking-wide text-outline mb-1">Submissions ({subs.length})</p>
                                <div className="space-y-1">
                                  {subs.length === 0 && <p className="text-xs text-outline">None yet.</p>}
                                  {subs.map((s: any) => (
                                    <div key={s.id} className="flex items-center gap-3 text-xs text-on-surface">
                                      <span className="w-40 truncate">{displayName(s.username, s.discordHandle, s.walletAddress)}</span>
                                      <span className={`badge-${s.status} text-[10px]`}>{getSubmissionStatusLabel(s.status)}</span>
                                      <span>{s.reviewTotalScore != null ? `${s.reviewTotalScore}/35` : "unscored"}</span>
                                      {s.id === winner?.id && <span className="text-ok font-semibold">winner</span>}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {ledgerTasks.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-outline">No completed tasks yet. Mark a task Completed (Tasks tab or the review page) to add it to the ledger.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {payableWinners.length > 0 && (
              <div className="card p-4 mb-6">
                <p className="text-xs font-semibold text-outline mb-3 uppercase tracking-wide">Batch Summary</p>
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-outline">Total Contributor Pay</p>
                    <p className="text-xl font-bold text-primary">
                      {payableWinners.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.rewardRbnt || 0), 0).toLocaleString()} RBNT
                    </p>
                    <p className="text-xs text-outline">~${payableWinners.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.reward || 0), 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-outline">Total Reviewer Pay</p>
                    <p className="text-xl font-bold text-on-surface">
                      {payableWinners.reduce((sum, s) => sum + Math.round((tasks.find((t) => t.id === s.taskId)?.rewardRbnt || 0) * 0.2), 0).toLocaleString()} RBNT
                    </p>
                    <p className="text-xs text-outline">~${payableWinners.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.reviewerComp || 0), 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {paidSubmissions.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-4 py-3" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
                  <p className="text-on-surface font-semibold text-sm">Payment History ({paidSubmissions.length})</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                        <th className="text-left px-4 py-3 font-semibold">Task</th>
                        <th className="text-left px-4 py-3 font-semibold">Contributor Wallet</th>
                        <th className="text-left px-4 py-3 font-semibold">Amount</th>
                        <th className="text-left px-4 py-3 font-semibold">Paid At</th>
                        <th className="text-left px-4 py-3 font-semibold">Marked By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidSubmissions.map((sub, i) => {
                        const task = tasks.find((t) => t.id === sub.taskId);
                        return (
                          <tr key={sub.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                            <td className="px-4 py-3 mono text-xs font-semibold text-on-surface">{sub.taskId}</td>
                            <td className="px-4 py-3 mono text-xs text-outline">{sub.walletAddress?.slice(0, 8)}...{sub.walletAddress?.slice(-4)}</td>
                            <td className="px-4 py-3 text-xs font-bold text-ok">{task ? formatReward(task.rewardRbnt, task.reward) : "-"}</td>
                            <td className="px-4 py-3 text-xs text-outline">{sub.paymentProcessedAt?.toDate?.()?.toLocaleDateString() ?? "-"}</td>
                            <td className="px-4 py-3 mono text-xs text-outline">
                              {sub.paymentProcessedByWallet
                                ? `${sub.paymentProcessedByWallet.slice(0, 6)}...${sub.paymentProcessedByWallet.slice(-4)}`
                                : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
  );
}

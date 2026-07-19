"use client";
import { Task, TaskCategory, getCategoryLabel, getStatusLabel, getSubmissionStatusLabel, displayName, TASK_STATUSES } from "@/lib/tasks";
import { useAdmin, ListEditor, TASK_CATEGORIES } from "@/app/admin/AdminProvider";
import SubmissionChat from "@/components/SubmissionChat";

export default function AdminModals() {
  const { submissions, auditSub, setAuditSub, overrideSub, setOverrideSub, overrideDecision, setOverrideDecision, overrideFeedback, setOverrideFeedback, overriding, payConfirmId, setPayConfirmId, markingPaid, rbntPrice, rbntPriceLoading, rbntPriceError, fetchRbntPrice, toRbnt, taskFormOpen, setTaskFormOpen, taskFormMode, formTaskId, setFormTaskId, formTitle, setFormTitle, formCategory, setFormCategory, formReward, setFormReward, formRewardRbnt, setFormRewardRbnt, formPaymentSplit, setFormPaymentSplit, formStatus, setFormStatus, formShortDesc, setFormShortDesc, formProblem, setFormProblem, formDeliverables, setFormDeliverables, formBenchmarks, setFormBenchmarks, formFailure, setFormFailure, formTechnicalReqs, setFormTechnicalReqs, formInfrastructure, setFormInfrastructure, formMaxSubs, setFormMaxSubs, formReviewerId, setFormReviewerId, reviewers, formSaving, formError, deleteConfirmId, setDeleteConfirmId, reviewerCompRbntDisplay, reviewerCompUsdDisplay, applyAdminOverride, markAsPaid, saveTask, deleteTask, walletToDiscord, reviewerLabel } = useAdmin();
  return (
    <>
      {/* TASK FORM PANEL */}
      {taskFormOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setTaskFormOpen(false)} />
          <div className="w-full max-w-2xl bg-surface-slate flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-container-high flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
              <div>
                <h2 className="font-bold text-on-surface">
                  {taskFormMode === "add" ? "Add New Task" : `Edit ${formTaskId}`}
                </h2>
                <p className="text-outline text-xs mt-0.5">All fields will be visible to contributors</p>
              </div>
              <button onClick={() => setTaskFormOpen(false)} className="text-outline hover:text-on-surface text-2xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className="label">Task ID</label>
                {taskFormMode === "add" ? (
                  <input className="input mono" value={formTaskId}
                    onChange={(e) => setFormTaskId(e.target.value.toUpperCase())}
                    placeholder="TASK-16" />
                ) : (
                  <div className="input bg-surface-container-low text-outline mono cursor-not-allowed">{formTaskId}</div>
                )}
              </div>

              <div>
                <label className="label">Title <span className="text-primary">*</span></label>
                <input className="input" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Task title" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={formCategory} onChange={(e) => setFormCategory(e.target.value as TaskCategory)}>
                    {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={formStatus} onChange={(e) => setFormStatus(e.target.value as Task["status"])}>
                    {TASK_STATUSES.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Max Submissions Cap (default 5)</label>
                  <input type="number" min="1" className="input" value={formMaxSubs} onChange={(e) => setFormMaxSubs(e.target.value)} />
                  <p className="text-[10px] text-outline">Visible to admins/reviewers only</p>
                </div>
              </div>

              {/* Assigned reviewer (B2). One reviewer owns every submission on the task. */}
              {/* A reviewer who has submitted to this task is not offered. */}
              <div>
                <label className="label">Assigned Reviewer</label>
                <select className="input" value={formReviewerId} onChange={(e) => setFormReviewerId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {reviewers
                    .filter((r: any) => !submissions.some((s: any) => s.taskId === formTaskId && s.walletAddress?.toLowerCase() === r.walletAddress?.toLowerCase()))
                    .map((r: any) => (
                      <option key={r.id} value={r.id}>{displayName(r.username, r.discordHandle, r.walletAddress)} · {r.role}</option>
                    ))}
                </select>
                <p className="text-[10px] text-outline">This reviewer sees every submission on the task and cannot submit to it. Reviewers who already submitted here are hidden.</p>
              </div>

              <div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Reward (RBNT)</label>
                    <input className="input mono" type="number" value={formRewardRbnt} onChange={(e) => setFormRewardRbnt(e.target.value)} placeholder="10678" />
                  </div>
                  <div>
                    <label className="label">USD Equivalent</label>
                    <input className="input mono" type="number" value={formReward} onChange={(e) => setFormReward(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="label">Payment Split</label>
                    <input className="input" value={formPaymentSplit} onChange={(e) => setFormPaymentSplit(e.target.value)} placeholder="100% RBNT" />
                  </div>
                </div>

                {(formRewardRbnt || formReward) && (
                  <div className="mt-2 rounded-lg border border-surface-container-high bg-surface-container-low px-3 py-2 flex items-center gap-2 flex-wrap text-xs text-on-surface">
                    <svg className="w-3 h-3 text-outline flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-outline">Reviewer comp (20%):</span>
                    <span className="font-semibold text-on-surface">
                      {reviewerCompRbntDisplay}
                      {reviewerCompRbntDisplay && reviewerCompUsdDisplay ? " " : ""}
                      {reviewerCompUsdDisplay}
                    </span>
                  </div>
                )}

                <div className="mt-2 rounded-lg border border-surface-container-high bg-surface-container-low px-3 py-2.5 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={fetchRbntPrice}
                    disabled={rbntPriceLoading}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50 flex-shrink-0"
                  >
                    {rbntPriceLoading ? (
                      <span className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    Fetch RBNT price
                  </button>
                  {rbntPriceError && <p className="text-xs text-error">{rbntPriceError}</p>}
                  {rbntPrice && !rbntPriceError && (
                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      <span className="text-outline">1 RBNT = <span className="mono font-semibold text-on-surface">${rbntPrice.toFixed(6)}</span></span>
                      {toRbnt(formReward) && (
                        <span className="text-on-surface">
                          Reward: <span className="font-semibold text-on-surface">{toRbnt(formReward)} RBNT</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Short Description</label>
                <textarea className="input resize-none" rows={2} value={formShortDesc}
                  onChange={(e) => setFormShortDesc(e.target.value)} placeholder="1-2 sentence summary shown on the task card" />
              </div>

              <div>
                <label className="label">Problem Statement</label>
                <textarea className="input resize-none" rows={3} value={formProblem}
                  onChange={(e) => setFormProblem(e.target.value)} placeholder="Why does this task exist? What problem does it solve?" />
              </div>

              <ListEditor label="Technical Requirements" items={formTechnicalReqs} setItems={setFormTechnicalReqs} placeholder="Requirement" />
              <ListEditor label="Required Deliverables" items={formDeliverables} setItems={setFormDeliverables} placeholder="Deliverable" />
              <ListEditor label="Quality Benchmarks" items={formBenchmarks} setItems={setFormBenchmarks} placeholder="Benchmark" />
              <ListEditor label="Failure Criteria" items={formFailure} setItems={setFormFailure} placeholder="Criterion" />
              <ListEditor label="Infrastructure / Resources" items={formInfrastructure} setItems={setFormInfrastructure} placeholder="Resource name or URL" />
            </div>

            <div className="px-6 py-4 border-t border-surface-container-high flex items-center gap-3 flex-shrink-0 bg-surface-container-low">
              <button onClick={saveTask} disabled={formSaving} className="btn-primary">
                {formSaving ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                ) : taskFormMode === "add" ? "Create Task" : "Save Changes"}
              </button>
              <button onClick={() => setTaskFormOpen(false)} className="btn-secondary">Cancel</button>
              {formError && <p className="text-error text-xs">{formError}</p>}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface-slate rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-bold text-on-surface mb-1">Delete Task?</h3>
            <p className="text-sm text-outline mb-5">
              Permanently delete <span className="mono font-semibold text-on-surface">{deleteConfirmId}</span>?
              This cannot be undone and will be logged to the audit trail.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteTask(deleteConfirmId)} className="btn-primary" style={{ backgroundColor: "#DC2626" }}>
                Delete
              </button>
              <button onClick={() => setDeleteConfirmId(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* MARK AS PAID CONFIRMATION */}
      {payConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface-slate rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-bold text-on-surface mb-1">Confirm Payment</h3>
            <p className="text-sm text-outline mb-1">
              Mark submission for <span className="mono font-semibold text-on-surface">{submissions.find((s) => s.id === payConfirmId)?.taskId}</span> as paid?
            </p>
            <p className="text-xs text-outline mb-5">This is logged to the audit trail and cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => markAsPaid(payConfirmId)}
                disabled={markingPaid}
                className="btn-primary flex items-center gap-2"
                style={{ backgroundColor: "#16a34a" }}
              >
                {markingPaid ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Marking...</>
                ) : "Confirm Paid"}
              </button>
              <button onClick={() => setPayConfirmId(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT PANEL (submission detail) */}
      {auditSub && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setAuditSub(null)} />
          <div className="w-full max-w-2xl bg-surface-slate flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-container-high flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
              <div>
                <h2 className="font-bold text-on-surface text-sm">Submission Audit</h2>
                <p className="text-outline text-xs mono">{auditSub.taskId}</p>
              </div>
              <button onClick={() => setAuditSub(null)} className="text-outline hover:text-on-surface text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-outline mb-3">Submission</p>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-outline">Contributor: </span>
                    <span className="mono text-on-surface">{auditSub.walletAddress}</span>
                  </div>
                  {auditSub.discordHandle && (
                    <div><span className="text-outline">Discord: </span><span className="text-on-surface">{auditSub.discordHandle}</span></div>
                  )}
                  <div>
                    <span className="text-outline">Submitted: </span>
                    <span className="text-on-surface">{auditSub.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}</span>
                  </div>
                  <div className="flex gap-3 pt-1 flex-wrap">
                    {auditSub.githubLink && <a href={auditSub.githubLink} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">GitHub →</a>}
                    {auditSub.liveLink && <a href={auditSub.liveLink} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">Live →</a>}
                    {auditSub.fileUrl && <a href={auditSub.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">File →</a>}
                  </div>
                  {auditSub.notes && (
                    <div className="mt-2 p-3 bg-surface-container-low rounded-lg">
                      <p className="text-outline mb-1">Notes from contributor</p>
                      <p className="text-on-surface leading-relaxed">{auditSub.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {auditSub.reviewerWallet && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-outline mb-3">Review</p>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-surface-container-low rounded-lg p-3">
                      <p className="text-xs text-outline mb-1">Score</p>
                      <p className="text-xl font-bold text-primary">
                        {auditSub.reviewTotalScore ?? "?"}<span className="text-sm font-normal text-outline">/35</span>
                      </p>
                    </div>
                    <div className="bg-surface-container-low rounded-lg p-3">
                      <p className="text-xs text-outline mb-1">Decision</p>
                      <span className={`badge-${auditSub.status}`}>{getSubmissionStatusLabel(auditSub.status)}</span>
                    </div>
                    <div className="bg-surface-container-low rounded-lg p-3">
                      <p className="text-xs text-outline mb-1">Reviewed</p>
                      <p className="text-xs text-on-surface">{auditSub.reviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}</p>
                    </div>
                  </div>
                  <div className="text-xs mb-3">
                    <span className="text-outline">Reviewer: </span>
                    <span className="font-semibold text-on-surface">{reviewerLabel(auditSub.reviewerWallet)}</span>
                    {walletToDiscord.has(auditSub.reviewerWallet?.toLowerCase()) && (
                      <span className="text-outline mono ml-1">({auditSub.reviewerWallet?.slice(0, 6)}...{auditSub.reviewerWallet?.slice(-4)})</span>
                    )}
                  </div>

                  {auditSub.reviewScores?.length > 0 && (
                    <div className="space-y-2">
                      {[
                        "Deliverable completeness",
                        "Quality Benchmarks met",
                        "Technical accuracy",
                        "Documentation quality",
                        "Test coverage / verification",
                        "Failure Criteria avoided",
                        "Overall standard",
                      ].map((criterion, i) => (
                        <div key={i} className="border border-surface-container-high rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-on-surface">{criterion}</p>
                            <div className="flex items-center gap-1.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <div key={s} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                                  auditSub.reviewScores[i] === s ? "bg-brand text-on-surface" : "bg-surface-container-low text-outline"
                                }`}>{s}</div>
                              ))}
                            </div>
                          </div>
                          {auditSub.reviewJustifications?.[i] && (
                            <p className="text-xs text-on-surface italic">{auditSub.reviewJustifications[i]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {auditSub.requiredChanges && (
                    <div className="mt-3 p-3 border  rounded-lg text-xs">
                      <p className="font-semibold text-warn mb-1">Required Changes</p>
                      <p className="text-warn whitespace-pre-line">{auditSub.requiredChanges}</p>
                      {auditSub.revisionDeadline && (
                        <p className="text-warn mt-1">Deadline: {auditSub.revisionDeadline}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {auditSub.adminOverride && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-outline mb-3">Admin Override</p>
                  <div className="p-3 border  rounded-lg text-xs">
                    <div className="mb-1">
                      <span className="text-outline">Overridden by: </span>
                      <span className="mono text-on-surface">{auditSub.adminOverrideWallet}</span>
                    </div>
                    <p className="text-warn">{auditSub.adminOverrideFeedback}</p>
                  </div>
                </div>
              )}

              <SubmissionChat
                submissionId={auditSub.id}
                taskId={auditSub.taskId}
                taskTitle={auditSub.taskTitle}
                contributorId={auditSub.contributorId}
                reviewerId={auditSub.reviewerId}
              />
            </div>
          </div>
        </div>
      )}

      {/* OVERRIDE MODAL */}
      {overrideSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface-slate rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-surface-container-high flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
              <div>
                <p className="text-on-surface font-bold text-sm">Admin Override</p>
                <p className="text-outline text-xs mono">{overrideSub.taskId}</p>
              </div>
              <button onClick={() => setOverrideSub(null)} className="text-outline hover:text-on-surface text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-xs text-outline mb-1">Score</p>
                  <p className="text-lg font-bold text-primary">
                    {overrideSub.reviewTotalScore ?? "?"}<span className="text-xs font-normal text-outline">/35</span>
                  </p>
                </div>
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-xs text-outline mb-1">Decision</p>
                  <p className="text-sm font-semibold text-on-surface capitalize">{overrideSub.reviewDecision ?? "none"}</p>
                </div>
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-xs text-outline mb-1">Status</p>
                  <span className={`badge-${overrideSub.status}`}>{getSubmissionStatusLabel(overrideSub.status)}</span>
                </div>
              </div>

              {overrideSub.reviewerWallet && (
                <div className="text-xs">
                  <span className="text-outline">Reviewed by: </span>
                  <span className="font-semibold text-on-surface">{reviewerLabel(overrideSub.reviewerWallet)}</span>
                  {walletToDiscord.has(overrideSub.reviewerWallet?.toLowerCase()) && (
                    <span className="text-outline mono ml-1">({overrideSub.reviewerWallet?.slice(0, 6)}...{overrideSub.reviewerWallet?.slice(-4)})</span>
                  )}
                </div>
              )}

              <div className="bg-surface-container-low rounded-lg p-3 text-xs text-on-surface">
                <span className="font-semibold text-primary">Warning: </span>
                This overrides the current status and affects payment eligibility. All overrides are logged to the audit trail.
              </div>

              <div>
                <p className="label mb-3">New Decision</p>
                <div className="flex gap-3 flex-wrap">
                  {(["approved", "under_review", "rejected"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setOverrideDecision(d)}
                      className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${
                        overrideDecision === d
                          ? d === "approved" ? "bg-green-600 text-on-surface"
                          : d === "under_review" ? "bg-blue-600 text-on-surface"
                          : "bg-red-600 text-on-surface"
                          : "bg-surface-slate border border-surface-container-high text-on-surface hover:border-outline"
                      }`}
                    >
                      {d === "under_review" ? "Return to Review" : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
                {overrideDecision === "under_review" && (
                  <p className="text-xs text-info mt-2">This will clear the existing review scores and return the submission to the open review queue.</p>
                )}
              </div>

              <div>
                <label className="label">Override Reason <span className="text-primary">*</span></label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Explain why this decision is being overridden. Reference the specific benchmark or failure criterion."
                  value={overrideFeedback}
                  onChange={(e) => setOverrideFeedback(e.target.value)}
                  maxLength={500}
                />
                <p className="text-xs text-outline mt-1 text-right">{overrideFeedback.length}/500</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-surface-container-high flex items-center gap-3 bg-surface-container-low">
              <button
                onClick={applyAdminOverride}
                disabled={overriding || !overrideDecision || !overrideFeedback.trim()}
                className="btn-primary"
              >
                {overriding ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Applying...</>
                ) : "Apply Override"}
              </button>
              <button onClick={() => setOverrideSub(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

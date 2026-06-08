"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, getCategoryLabel, formatReward } from "@/lib/tasks";
import Navbar from "@/components/Navbar";
import SubmissionChat from "@/components/SubmissionChat";

const RUBRIC_CRITERIA = [
  "Deliverable completeness: does the submission include everything listed in Required Deliverables?",
  "Quality Benchmarks met: does the submission satisfy each benchmark defined in the task spec?",
  "Technical accuracy: is the code, analysis, or content factually correct and free of critical errors?",
  "Documentation quality: is the companion documentation clear, complete, and deployment-ready?",
  "Test coverage / verification: are all claims, functions, or outputs verifiable and tested?",
  "Failure Criteria: does the submission avoid every defined failure condition?",
  "Overall standard: does the submission meet the bar expected for a paid, published deliverable?",
];

type ReviewTab = "active" | "my_reviews";

export default function ReviewerPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();

  const [reviewTab, setReviewTab] = useState<ReviewTab>("active");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [myReviews, setMyReviews] = useState<any[]>([]);
  const [myReviewsLoading, setMyReviewsLoading] = useState(false);
  const [myReviewsLoaded, setMyReviewsLoaded] = useState(false);
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map());
  const [selected, setSelected] = useState<any>(null);
  const [scores, setScores] = useState<number[]>(new Array(7).fill(0));
  const [justifications, setJustifications] = useState<string[]>(new Array(7).fill(""));
  const [decision, setDecision] = useState<"approved" | "revision" | "rejected" | "">("");
  const [requiredChanges, setRequiredChanges] = useState("");
  const [revisionDeadline, setRevisionDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [overrideDecision, setOverrideDecision] = useState<"approved" | "rejected" | "">("");
  const [overrideFeedback, setOverrideFeedback] = useState("");
  const [overriding, setOverriding] = useState(false);

  const isAdmin = appUser?.role === "admin";
  const isOverrideMode = isAdmin && selected && selected.status !== "under_review";

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role === "contributor"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  useEffect(() => {
    if (!user || !appUser) return;
    const load = async () => {
      const [subSnap, taskSnap] = await Promise.all([
        appUser.role === "admin"
          ? getDocs(collection(db, "submissions"))
          : getDocs(query(collection(db, "submissions"), where("status", "==", "under_review"))),
        getDocs(collection(db, "tasks")),
      ]);
      setSubmissions(subSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const map = new Map<string, Task>();
      taskSnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Task));
      setTasks(map);
      setFetchLoading(false);
    };
    load();
  }, [user, appUser]);

  useEffect(() => {
    if (reviewTab !== "my_reviews" || !user || myReviewsLoaded) return;
    setMyReviewsLoading(true);
    getDocs(query(collection(db, "submissions"), where("reviewerId", "==", user.uid)))
      .then((snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.reviewedAt?.seconds ?? 0) - (a.reviewedAt?.seconds ?? 0));
        setMyReviews(sorted);
        setMyReviewsLoading(false);
        setMyReviewsLoaded(true);
      });
  }, [reviewTab, user, myReviewsLoaded]);

  const openReview = (sub: any) => {
    updateDoc(doc(db, "submissions", sub.id), {
      reviewingBy: user?.uid,
      reviewingByWallet: appUser?.walletAddress,
    }).catch(console.error);
    setSubmissions((prev) => prev.map((s) =>
      s.id === sub.id ? { ...s, reviewingBy: user?.uid, reviewingByWallet: appUser?.walletAddress } : s
    ));
    setSelected(sub);
    setScores(sub.reviewScores || new Array(7).fill(0));
    setJustifications(sub.reviewJustifications || new Array(7).fill(""));
    setDecision(sub.reviewDecision || "");
    setRequiredChanges(sub.requiredChanges || "");
    setRevisionDeadline(sub.revisionDeadline || "");
    setOverrideDecision("");
    setOverrideFeedback("");
  };

  const closeReview = () => {
    if (selected && selected.reviewingBy === user?.uid) {
      updateDoc(doc(db, "submissions", selected.id), {
        reviewingBy: null,
        reviewingByWallet: null,
      }).catch(console.error);
      setSubmissions((prev) => prev.map((s) =>
        s.id === selected.id ? { ...s, reviewingBy: null, reviewingByWallet: null } : s
      ));
    }
    setSelected(null);
  };

  const totalScore = scores.reduce((a, b) => a + b, 0);

  const submitReview = async () => {
    if (!selected || !decision || scores.some((s) => s === 0)) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "submissions", selected.id), {
        status: decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "revision_requested",
        reviewDecision: decision,
        reviewScores: scores,
        reviewJustifications: justifications,
        reviewTotalScore: totalScore,
        requiredChanges,
        revisionDeadline,
        reviewerId: user?.uid,
        reviewerWallet: appUser?.walletAddress,
        reviewingBy: null,
        reviewingByWallet: null,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
      setMyReviewsLoaded(false);
      setSelected(null);
    } catch {
      alert("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const applyOverride = async () => {
    if (!selected || !overrideDecision || !overrideFeedback.trim()) return;
    setOverriding(true);
    try {
      await updateDoc(doc(db, "submissions", selected.id), {
        status: overrideDecision === "approved" ? "approved" : "rejected",
        reviewDecision: overrideDecision,
        adminOverride: true,
        adminOverrideBy: user?.uid,
        adminOverrideWallet: appUser?.walletAddress,
        adminOverrideFeedback: overrideFeedback,
        reviewingBy: null,
        reviewingByWallet: null,
        adminOverrideAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
      setSelected(null);
    } catch {
      alert("Override failed. Please try again.");
    } finally {
      setOverriding(false);
    }
  };

  if (loading || fetchLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
      <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {selected ? (
          <div>
            <button onClick={closeReview} className="btn-ghost mb-4 text-sm">
              Back to submissions
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Submission details */}
              <div className="lg:col-span-1 space-y-4">
                <div className="card p-5">
                  <p className="text-xs font-mono text-[#AAAAAA] mb-1">{selected.taskId}</p>
                  <h2 className="font-bold text-[#1A1A2E] text-sm mb-3">{selected.taskTitle}</h2>

                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="text-[#AAAAAA] mb-0.5">Submitted by</p>
                      <p className="font-mono text-[#1A1A2E] break-all">{selected.walletAddress}</p>
                    </div>
                    {selected.discordHandle && (
                      <div className="flex justify-between">
                        <span className="text-[#AAAAAA]">Discord</span>
                        <span className="text-[#1A1A2E]">{selected.discordHandle}</span>
                      </div>
                    )}
                    {selected.reviewerWallet && (
                      <div>
                        <p className="text-[#AAAAAA] mb-0.5">Reviewed by</p>
                        <p className="font-mono text-[#1A1A2E] break-all">{selected.reviewerWallet}</p>
                      </div>
                    )}
                    {selected.adminOverrideWallet && (
                      <div>
                        <p className="text-[#AAAAAA] mb-0.5">Admin override by</p>
                        <p className="font-mono text-[#1A1A2E] break-all">{selected.adminOverrideWallet}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {selected.githubLink && (
                      <a href={selected.githubLink} target="_blank" rel="noopener noreferrer"
                        className="block text-xs text-[#E63329] font-semibold hover:underline truncate">
                        GitHub Repository →
                      </a>
                    )}
                    {selected.liveLink && (
                      <a href={selected.liveLink} target="_blank" rel="noopener noreferrer"
                        className="block text-xs text-[#E63329] font-semibold hover:underline truncate">
                        Live URL →
                      </a>
                    )}
                    {selected.publishedLink && (
                      <a href={selected.publishedLink} target="_blank" rel="noopener noreferrer"
                        className="block text-xs text-[#E63329] font-semibold hover:underline truncate">
                        Published Article →
                      </a>
                    )}
                    {selected.fileUrl && (
                      <a href={selected.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="block text-xs text-[#E63329] font-semibold hover:underline truncate">
                        Download File: {selected.fileName} →
                      </a>
                    )}
                  </div>

                  {selected.notes && (
                    <div className="mt-4 p-3 bg-[#F4F5F7] rounded-lg">
                      <p className="text-xs font-semibold text-[#555555] mb-1">Notes from contributor</p>
                      <p className="text-xs text-[#555555] leading-relaxed">{selected.notes}</p>
                    </div>
                  )}
                </div>

                {(() => {
                  const task = tasks.get(selected.taskId);
                  return task ? (
                    <div className="card p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Quality Benchmarks</p>
                      <ul className="space-y-1.5">
                        {task.qualityBenchmarks.map((b, i) => (
                          <li key={i} className="flex gap-2 text-xs text-[#555555]">
                            <span className="text-green-600 shrink-0">✓</span><span>{b}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3 mt-4">Failure Criteria</p>
                      <ul className="space-y-1.5">
                        {task.failureCriteria.map((f, i) => (
                          <li key={i} className="flex gap-2 text-xs text-[#555555]">
                            <span className="text-red-500 shrink-0">✕</span><span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}

                <div className="card p-5">
                  <SubmissionChat submissionId={selected.id} />
                </div>
              </div>

              {/* Rubric or override panel */}
              <div className="lg:col-span-2">
                {isOverrideMode ? (
                  <div className="card p-6">
                    <div className="mb-6 pb-6 border-b border-[#E8EBF0]">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Original Review</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#F4F5F7] rounded-lg p-3">
                          <p className="text-xs text-[#AAAAAA] mb-1">Score</p>
                          <p className="text-xl font-bold text-[#E63329]">
                            {selected.reviewTotalScore ?? "?"}<span className="text-sm font-normal text-[#AAAAAA]">/35</span>
                          </p>
                        </div>
                        <div className="bg-[#F4F5F7] rounded-lg p-3">
                          <p className="text-xs text-[#AAAAAA] mb-1">Decision</p>
                          <p className="text-sm font-semibold text-[#1A1A2E] capitalize">{selected.reviewDecision ?? "none"}</p>
                        </div>
                        <div className="bg-[#F4F5F7] rounded-lg p-3">
                          <p className="text-xs text-[#AAAAAA] mb-1">Status</p>
                          <span className={`badge-${selected.status}`}>{selected.status?.replace(/_/g, " ")}</span>
                        </div>
                      </div>
                      {selected.adminOverride && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">Previously overridden by admin</p>
                          <p className="text-xs text-yellow-700">{selected.adminOverrideFeedback}</p>
                        </div>
                      )}
                    </div>

                    <h3 className="font-bold text-[#1A1A2E] mb-4">Admin Override</h3>
                    <div className="bg-[#FEF0EF] rounded-lg p-3 mb-5 text-xs text-[#555555]">
                      <span className="font-semibold text-[#E63329]">Warning: </span>
                      Overriding changes the submission status and affects payment eligibility. Provide a clear, documented reason.
                    </div>

                    <div className="mb-4">
                      <p className="label mb-3">New Decision</p>
                      <div className="flex gap-3">
                        {(["approved", "rejected"] as const).map((d) => (
                          <button key={d} type="button" onClick={() => setOverrideDecision(d)}
                            className={`px-5 py-2 rounded text-sm font-semibold transition-colors capitalize ${
                              overrideDecision === d
                                ? d === "approved" ? "bg-green-600 text-white" : "bg-red-600 text-white"
                                : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#555555]"
                            }`}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-5">
                      <label className="label">Override Reason <span className="text-[#E63329]">*</span></label>
                      <textarea className="input resize-none" rows={4}
                        placeholder="Explain why this decision is being overridden. Reference the specific benchmark or failure criterion."
                        value={overrideFeedback} onChange={(e) => setOverrideFeedback(e.target.value)} maxLength={500} />
                      <p className="text-xs text-[#AAAAAA] mt-1 text-right">{overrideFeedback.length}/500</p>
                    </div>

                    {(!overrideDecision || !overrideFeedback.trim()) && (
                      <p className="text-xs text-red-500 mb-3">Select a new decision and provide a reason to continue</p>
                    )}
                    <button onClick={applyOverride} disabled={overriding || !overrideDecision || !overrideFeedback.trim()} className="btn-primary">
                      {overriding ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Applying Override...
                        </span>
                      ) : "Apply Override"}
                    </button>
                  </div>
                ) : (
                  <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-[#1A1A2E]">Review Rubric</h3>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-[#E63329]">{totalScore}<span className="text-base text-[#AAAAAA] font-normal">/35</span></p>
                        <p className="text-xs text-[#AAAAAA]">Total Score</p>
                      </div>
                    </div>

                    <div className="bg-[#FEF0EF] rounded-lg p-3 mb-5 text-xs text-[#555555]">
                      <span className="font-semibold text-[#E63329]">Scale: </span>
                      1 = Does not meet standard · 2 = Partially meets · 3 = Meets standard · 4 = Exceeds · 5 = Exceptional
                    </div>

                    <div className="space-y-5">
                      {RUBRIC_CRITERIA.map((criterion, i) => (
                        <div key={i} className={`p-4 rounded-lg ${i % 2 === 0 ? "bg-[#F4F5F7]" : "bg-white border border-[#E8EBF0]"}`}>
                          <p className="text-xs font-semibold text-[#1A1A2E] mb-3 leading-relaxed">{criterion}</p>
                          <div className="flex gap-2 mb-3">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button key={s} type="button"
                                onClick={() => { const n = [...scores]; n[i] = s; setScores(n); }}
                                className={`w-9 h-9 rounded text-sm font-bold transition-colors ${
                                  scores[i] === s ? "bg-[#E63329] text-white" : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#E63329]"
                                }`}>{s}</button>
                            ))}
                            {scores[i] > 0 && (
                              <span className="text-xs text-[#E63329] font-semibold self-center ml-1">
                                {["", "Does not meet", "Partially meets", "Meets standard", "Exceeds", "Exceptional"][scores[i]]}
                              </span>
                            )}
                          </div>
                          <div>
                            <input className="input text-xs" placeholder="One-line justification (max 30 words)"
                              value={justifications[i]}
                              onChange={(e) => {
                                const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                                if (words.length <= 30) { const n = [...justifications]; n[i] = e.target.value; setJustifications(n); }
                              }} />
                            <p className="text-xs text-[#AAAAAA] mt-0.5 text-right">
                              {justifications[i].trim().split(/\s+/).filter(Boolean).length}/30 words
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-[#E8EBF0]">
                      <p className="label mb-3">Decision</p>
                      <div className="flex gap-3 mb-4 flex-wrap">
                        {(["approved", "revision", "rejected"] as const).map((d) => (
                          <button key={d} type="button" onClick={() => setDecision(d)}
                            className={`px-4 py-2 rounded text-sm font-semibold transition-colors capitalize ${
                              decision === d
                                ? d === "approved" ? "bg-green-600 text-white" : d === "rejected" ? "bg-red-600 text-white" : "bg-yellow-500 text-white"
                                : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#555555]"
                            }`}>
                            {d === "revision" ? "Revision Requested" : d.charAt(0).toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>

                      {(decision === "revision" || decision === "rejected") && (
                        <div className="space-y-3">
                          <div>
                            <label className="label">Required Changes <span className="text-xs text-[#AAAAAA] font-normal normal-case">(number each item, max 3 sentences per item)</span></label>
                            <textarea className="input resize-none text-sm" rows={4}
                              placeholder="1. [What needs to change, referencing the specific benchmark]&#10;2.&#10;3."
                              value={requiredChanges} onChange={(e) => setRequiredChanges(e.target.value)} />
                          </div>
                          <div>
                            <label className="label">Revision Deadline</label>
                            <input className="input" type="date" value={revisionDeadline} onChange={(e) => setRevisionDeadline(e.target.value)} />
                          </div>
                        </div>
                      )}

                      <div className="mt-4">
                        {scores.some((s) => s === 0) && <p className="text-xs text-red-500 mb-2">All 7 criteria must be scored before submitting</p>}
                        {!decision && <p className="text-xs text-red-500 mb-2">Please select a decision</p>}
                        <button onClick={submitReview} disabled={submitting || scores.some((s) => s === 0) || !decision} className="btn-primary">
                          {submitting ? (
                            <span className="flex items-center gap-2">
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Submitting Review...
                            </span>
                          ) : "Submit Review"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Header + tabs */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">
                {isAdmin ? "Review and Oversight" : "Reviewer Dashboard"}
              </h1>
              <div className="flex gap-1 bg-white border border-[#E8EBF0] rounded-lg p-1 w-fit shadow-sm">
                <button onClick={() => setReviewTab("active")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    reviewTab === "active" ? "bg-[#E63329] text-white shadow-sm" : "text-[#888888] hover:text-[#1A1A2E]"
                  }`}>
                  {isAdmin ? "All Submissions" : "Active Queue"}
                  {reviewTab === "active" && (
                    <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{submissions.length}</span>
                  )}
                </button>
                <button onClick={() => setReviewTab("my_reviews")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    reviewTab === "my_reviews" ? "bg-[#E63329] text-white shadow-sm" : "text-[#888888] hover:text-[#1A1A2E]"
                  }`}>
                  My Reviews
                </button>
              </div>
            </div>

            {/* Active queue tab */}
            {reviewTab === "active" && (
              <div>
                <p className="text-[#888888] text-sm mb-4">
                  {isAdmin
                    ? `${submissions.length} total submission${submissions.length !== 1 ? "s" : ""}. Admins can review, score, and override any decision.`
                    : `${submissions.length} submission${submissions.length !== 1 ? "s" : ""} awaiting review. Self-select tasks within your domain of expertise.`
                  }
                </p>
                {submissions.length === 0 ? (
                  <div className="card p-12 text-center">
                    <p className="text-[#555555] text-sm">No submissions awaiting review right now.</p>
                    <p className="text-xs text-[#AAAAAA] mt-1">Check back when contributors submit their work.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {submissions.map((sub) => {
                      const task = tasks.get(sub.taskId);
                      const lockedByOther = sub.reviewingBy && sub.reviewingBy !== user?.uid;
                      const lockedByMe = sub.reviewingBy && sub.reviewingBy === user?.uid;
                      return (
                        <div key={sub.id} className={`card p-5 transition-colors ${lockedByOther ? "opacity-70" : "hover:border-[#E63329]"}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-xs font-mono text-[#AAAAAA]">{sub.taskId}</p>
                              <h3 className="font-bold text-[#1A1A2E] text-sm mt-0.5">{sub.taskTitle}</h3>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {task && <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>}
                              {isAdmin && <span className={`badge-${sub.status}`}>{sub.status?.replace(/_/g, " ")}</span>}
                              {lockedByMe && <span className="badge bg-blue-50 text-blue-700">you are reviewing</span>}
                              {lockedByOther && <span className="badge bg-yellow-50 text-yellow-700">in review</span>}
                              {isAdmin && sub.adminOverride && <span className="badge bg-yellow-50 text-yellow-700">overridden</span>}
                            </div>
                          </div>

                          <div className="text-xs text-[#555555] space-y-1 mb-4">
                            <p>Contributor: <span className="font-mono">{sub.walletAddress?.slice(0, 6)}...{sub.walletAddress?.slice(-4)}</span></p>
                            {sub.discordHandle && <p>Discord: {sub.discordHandle}</p>}
                            <p>Submitted: {sub.createdAt?.toDate?.()?.toLocaleDateString()}</p>
                            {lockedByOther && (
                              <p className="text-yellow-600">
                                Being reviewed by: <span className="font-mono">{sub.reviewingByWallet?.slice(0, 6)}...{sub.reviewingByWallet?.slice(-4)}</span>
                              </p>
                            )}
                            {isAdmin && sub.reviewerWallet && (
                              <p>Reviewer: <span className="font-mono">{sub.reviewerWallet?.slice(0, 6)}...{sub.reviewerWallet?.slice(-4)}</span></p>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-[#E8EBF0]">
                            <p className="text-base font-bold text-[#E63329]">
                              {task ? formatReward(task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined, task.reviewerComp) : "-"} reviewer comp
                            </p>
                            {lockedByOther ? (
                              <div className="flex flex-col items-end gap-1">
                                <button disabled className="btn-secondary text-xs px-4 py-2 opacity-50 cursor-not-allowed">In Review</button>
                                <button onClick={() => openReview(sub)} className="text-xs text-[#888888] hover:text-[#E63329] underline transition-colors">
                                  Take over
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => openReview(sub)} className="btn-primary text-xs px-4 py-2">
                                {isAdmin && sub.status !== "under_review" ? "View / Override" : "Review This"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* My reviews tab */}
            {reviewTab === "my_reviews" && (
              <div>
                {myReviewsLoading ? (
                  <div className="flex justify-center py-16">
                    <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : myReviews.length === 0 ? (
                  <div className="card p-12 text-center">
                    <p className="text-[#555555] text-sm">No completed reviews yet.</p>
                    <p className="text-xs text-[#AAAAAA] mt-1">Reviews you submit will appear here.</p>
                  </div>
                ) : (
                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-white" style={{ backgroundColor: "#2C2C2C" }}>
                          <th className="text-left px-4 py-3 font-semibold">Task</th>
                          <th className="text-left px-4 py-3 font-semibold">Contributor</th>
                          <th className="text-left px-4 py-3 font-semibold">Decision</th>
                          <th className="text-left px-4 py-3 font-semibold">Score</th>
                          <th className="text-left px-4 py-3 font-semibold">Reviewed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myReviews.map((sub, i) => (
                          <tr key={sub.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs font-semibold text-[#1A1A2E]">{sub.taskId}</p>
                              <p className="text-xs text-[#888888] truncate max-w-[160px]">{sub.taskTitle}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs text-[#555555]">{sub.walletAddress?.slice(0, 6)}...{sub.walletAddress?.slice(-4)}</p>
                              {sub.discordHandle && <p className="text-xs text-[#AAAAAA]">{sub.discordHandle}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <span className={`badge-${sub.status}`}>{sub.status?.replace(/_/g, " ")}</span>
                                {sub.adminOverride && <span className="badge bg-yellow-50 text-yellow-700">overridden</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {sub.reviewTotalScore
                                ? <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span>
                                : <span className="text-[#AAAAAA]">-</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-[#888888]">
                              {sub.reviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

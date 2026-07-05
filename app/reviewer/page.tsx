"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const isAdmin = appUser?.role === "admin";

  // Track the submission ID we currently hold the "reviewing" lock on, for reliable cleanup
  const currentLockRef = useRef<string | null>(null);

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
      let allSubs = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const map = new Map<string, Task>();
      taskSnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Task));

      // Enforce reviewer classes from docs (Technical/Content/Research)
      if (appUser.role === "reviewer" && appUser.reviewerCategories && appUser.reviewerCategories.length > 0) {
        allSubs = allSubs.filter((s: any) => {
          const t = map.get(s.taskId);
          return t && appUser.reviewerCategories!.includes(t.category);
        });
      }

      setSubmissions(allSubs);
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

  // Release any lock we hold when leaving the page / unmounting / navigating away
  // This prevents "stuck locked" states when reviewers close tab or refresh while a submission is open
  useEffect(() => {
    const releaseHeldLock = () => {
      const lockedId = currentLockRef.current;
      if (lockedId) {
        updateDoc(doc(db, "submissions", lockedId), {
          reviewingBy: null,
          reviewingByWallet: null,
        }).catch(() => {});
        currentLockRef.current = null;
      }
    };

    const handleBeforeUnload = () => releaseHeldLock();

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      releaseHeldLock();
    };
  }, []);

  const openReview = (sub: any, opts: { override?: boolean } = {}) => {
    const isAdminViewingReviewed = isAdmin && sub.status !== "under_review";

    // If we currently hold a lock on a *different* submission, release it first (switching cards)
    if (currentLockRef.current && currentLockRef.current !== sub.id) {
      const prevId = currentLockRef.current;
      updateDoc(doc(db, "submissions", prevId), {
        reviewingBy: null,
        reviewingByWallet: null,
      }).catch(() => {});
      setSubmissions((prev) => prev.map((s) =>
        s.id === prevId ? { ...s, reviewingBy: null, reviewingByWallet: null } : s
      ));
      currentLockRef.current = null;
    }

    if (!isAdminViewingReviewed) {
      // Only lock as "reviewing" when actively taking a submission for review (not admin pure view/override of past reviews)
      updateDoc(doc(db, "submissions", sub.id), {
        reviewingBy: user?.uid,
        reviewingByWallet: appUser?.walletAddress,
      }).catch(console.error);
      setSubmissions((prev) => prev.map((s) =>
        s.id === sub.id ? { ...s, reviewingBy: user?.uid, reviewingByWallet: appUser?.walletAddress } : s
      ));
      currentLockRef.current = sub.id;
    } else {
      // Pure admin view/override of a completed review - do not claim lock
      currentLockRef.current = null;
    }

    setSelected(sub);
    setScores(sub.reviewScores || new Array(7).fill(0));
    setJustifications(sub.reviewJustifications || new Array(7).fill(""));
    setDecision(sub.reviewDecision || "");
    setRequiredChanges(sub.requiredChanges || "");
    setRevisionDeadline(sub.revisionDeadline || "");
    setOverrideDecision("");
    setOverrideFeedback("");
    setShowOverrideForm(!!opts.override);
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
    currentLockRef.current = null;
    setMyReviewsLoaded(false);
    setSelected(null);
    setShowOverrideForm(false);
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
      currentLockRef.current = null;
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
      currentLockRef.current = null;
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

                {/* NEW: Full task description inline - beautiful rich view, no tab switching needed */}
                {(() => {
                  const fullTask = tasks.get(selected.taskId);
                  if (!fullTask) return null;
                  return (
                    <div className="card p-5 mt-4 border-l-4 border-[#E63329]">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-2">Full Task Specs (for review)</p>
                      <div className="text-xs text-[#1A1A2E] font-bold mb-1">{fullTask.title}</div>
                      <p className="text-xs text-[#555555] mb-3 leading-relaxed">{fullTask.problem || fullTask.shortDescription}</p>

                      {fullTask.deliverables?.length > 0 && (
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold text-[#888888] mb-1">Deliverables</div>
                          <ul className="text-xs text-[#555555] space-y-0.5 pl-3">
                            {fullTask.deliverables.slice(0, 3).map((d: string, i: number) => (
                              <li key={i} className="list-disc"> {d}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex gap-2 text-[10px] mt-2">
                        <Link href={`/tasks/${selected.taskId}`} className="text-[#E63329] hover:underline">View full task →</Link>
                      </div>
                    </div>
                  );
                })()}

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
                  <SubmissionChat
                    submissionId={selected.id}
                    taskId={selected.taskId}
                    taskTitle={selected.taskTitle}
                    contributorId={selected.contributorId}
                    reviewerId={selected.reviewerId}
                  />
                </div>
              </div>

              {/* Rubric or override panel */}
              <div className="lg:col-span-2">
                {isAdmin && selected && selected.status !== "under_review" ? (
                  showOverrideForm ? (
                    /* Admin override form - dedicated after viewing */
                    <div className="card p-6">
                      <button 
                        onClick={() => setShowOverrideForm(false)} 
                        className="text-xs text-[#E63329] mb-3 hover:underline flex items-center gap-1"
                      >
                        ← Back to review details
                      </button>

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
                    /* Admin VIEW mode for reviewed submissions - clean read-only */
                    <div className="card p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-[#1A1A2E]">Review Details</h3>
                        <button 
                          onClick={() => setShowOverrideForm(true)} 
                          className="btn-primary text-xs px-4 py-2"
                        >
                          Override Decision
                        </button>
                      </div>

                      <div className="mb-4 text-xs space-y-1">
                        <div>
                          <span className="text-[#AAAAAA]">Reviewed by: </span>
                          <span className="font-mono">{selected.reviewerWallet?.slice(0,6)}...{selected.reviewerWallet?.slice(-4)}</span>
                        </div>
                        <div>
                          <span className="text-[#AAAAAA]">Decision: </span>
                          <span className={`badge-${selected.reviewDecision || selected.status} ml-1`}>{(selected.reviewDecision || selected.status || '').replace(/_/g, ' ')}</span>
                        </div>
                        {selected.reviewTotalScore && (
                          <div>
                            <span className="text-[#AAAAAA]">Score: </span>
                            <span className="font-bold text-[#E63329]">{selected.reviewTotalScore}/35</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        {RUBRIC_CRITERIA.map((criterion, i) => (
                          <div key={i} className="p-4 bg-[#F4F5F7] rounded text-xs">
                            <p className="font-semibold text-[#1A1A2E] mb-1">{criterion}</p>
                            <div className="flex items-baseline gap-2">
                              <span className="font-bold text-[#E63329] text-base">{selected.reviewScores?.[i] ?? '—'}/5</span>
                              <span className="text-[#555555]">{selected.reviewJustifications?.[i] || 'No justification provided.'}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {selected.requiredChanges && (
                        <div className="mt-4 p-3 bg-yellow-50 rounded">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">Required Changes</p>
                          <p className="text-xs text-yellow-700 whitespace-pre-line">{selected.requiredChanges}</p>
                        </div>
                      )}

                      {selected.adminOverride && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Override Applied</p>
                          <p className="text-xs text-yellow-700">{selected.adminOverrideFeedback}</p>
                        </div>
                      )}

                      <div className="mt-4 text-xs text-[#888888]">
                        Click "Override Decision" above if you need to change this review.
                      </div>
                    </div>
                  )
                ) : (
                  /* Normal editing rubric for active reviews */
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
                    ? `${submissions.length} total submission${submissions.length !== 1 ? "s" : ""}. Admins can review, score, and override any decision. "in review" badges show active claims by a reviewer (admins can open anyway).`
                    : `${submissions.length} submission${submissions.length !== 1 ? "s" : ""} awaiting review. "in review" badges mean another reviewer currently has it open (prevents two people editing the same one at once). Self-select tasks within your domain of expertise.`
                  }
                </p>
                {submissions.length === 0 ? (
                  <div className="card p-12 text-center">
                    <p className="text-[#555555] text-sm">No submissions awaiting review right now.</p>
                    <p className="text-xs text-[#AAAAAA] mt-1">Check back when contributors submit their work.</p>
                  </div>
                ) : (
                  // Grouped by task with horizontal scroll - beautiful matching existing .card / badge style
                  <div className="space-y-6">
                    {Object.entries(
                      submissions.reduce((acc: Record<string, any[]>, sub: any) => {
                        const key = sub.taskId;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(sub);
                        return acc;
                      }, {} as Record<string, any[]>)
                    ).map(([taskId, subs]) => {
                      const typedSubs = subs as any[];
                      const task = tasks.get(taskId);
                      const cap = task?.maxSubmissions ?? 5;
                      const isFull = typedSubs.length >= cap;
                      const unreviewed = typedSubs.filter((s) => !s.reviewerId && s.status === "under_review").length;
                      return (
                        <div key={taskId} className="card p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-[#1A1A2E]">{taskId}</span>
                              {task && <span className={`badge-${task.category} text-xs`}>{getCategoryLabel(task.category)}</span>}
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isFull ? "bg-red-100 text-red-700" : "bg-[#E8EBF0] text-[#555555]"}`}>
                                {typedSubs.length}/{cap} submissions
                              </span>
                              {isFull && <span className="text-[10px] font-bold text-red-600">MAX ALLOWABLE SUBMISSIONS REACHED</span>}
                              {unreviewed > 0 && <span className="badge bg-blue-50 text-blue-700 text-[10px]">{unreviewed} unreviewed</span>}
                            </div>
                            <div className="text-xs text-[#888888]">
                              {task ? formatReward(task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined, task.reviewerComp) : ""} reviewer comp
                            </div>
                          </div>

                          {task && (
                            <div className="mb-3 p-3 bg-[#F4F5F7] rounded text-xs text-[#555555] line-clamp-3">
                              {task.problem || task.shortDescription}
                            </div>
                          )}

                          {/* Horizontal scroll of submissions - beautiful, matches card style */}
                          <div className="flex gap-4 overflow-x-auto snap-x pb-2 -mx-1 px-1">
                            {typedSubs.map((sub: any) => {
                              const lockedByOther = sub.reviewingBy && sub.reviewingBy !== user?.uid;
                              const lockedByMe = sub.reviewingBy && sub.reviewingBy === user?.uid;
                              const isNew = !sub.reviewerId && sub.status === "under_review";
                              const lockOwnerShort = sub.reviewingByWallet
                                ? `${sub.reviewingByWallet.slice(0, 6)}...${sub.reviewingByWallet.slice(-4)}`
                                : null;
                              return (
                                <div
                                  key={sub.id}
                                  className={`snap-start min-w-[300px] max-w-[340px] card p-4 flex-shrink-0 transition-all ${(lockedByOther && !isAdmin) ? "opacity-70" : "hover:border-[#E63329] hover:shadow-md"} ${isNew ? "ring-1 ring-blue-300" : ""}`}
                                >
                                  <div className="flex justify-between mb-2">
                                    <div>
                                      <span className="font-mono text-xs text-[#AAAAAA]">{sub.walletAddress?.slice(0,6)}...{sub.walletAddress?.slice(-4)}</span>
                                      {sub.discordHandle && <span className="text-[10px] ml-1 text-[#888888]">({sub.discordHandle})</span>}
                                    </div>
                                    <div className="flex gap-1">
                                      {isNew && <span className="badge bg-blue-50 text-blue-700 text-[9px]">NEW</span>}
                                      {isAdmin && <span className={`badge-${sub.status} text-[9px]`}>{sub.status?.replace(/_/g, " ")}</span>}
                                      {lockedByMe && <span className="badge bg-blue-50 text-blue-700 text-[9px]">you</span>}
                                      {lockedByOther && (
                                        <span
                                          className="badge bg-yellow-50 text-yellow-700 text-[9px]"
                                          title={lockOwnerShort ? `Being reviewed by ${lockOwnerShort}` : "Being reviewed by another user"}
                                        >
                                          in review
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-xs text-[#555555] mb-3 line-clamp-2">
                                    {sub.notes || "No notes"}
                                  </div>

                                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E8EBF0]">
                                    <div>
                                      {sub.reviewTotalScore ? <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span> : "—"}
                                    </div>
                                    <div className="flex gap-1.5">
                                      {isAdmin && sub.status !== "under_review" ? (
                                        <>
                                          <button
                                            onClick={() => openReview(sub)}
                                            className="btn-primary text-xs px-2.5 py-0.5"
                                          >
                                            View Review
                                          </button>
                                          <button
                                            onClick={() => openReview(sub, { override: true })}
                                            className="px-2.5 py-0.5 rounded text-xs font-semibold border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF] transition-colors"
                                          >
                                            Override
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => openReview(sub)}
                                          disabled={lockedByOther && !isAdmin}
                                          className={`btn-primary text-xs px-3 py-1 ${lockedByOther && !isAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                                        >
                                          {lockedByOther && !isAdmin ? "In review" : "Review"}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {(sub.githubLink || sub.liveLink) && (
                                    <div className="mt-1 flex gap-2 text-[10px]">
                                      {sub.githubLink && <a href={sub.githubLink} target="_blank" className="text-[#E63329]">GitHub</a>}
                                      {sub.liveLink && <a href={sub.liveLink} target="_blank" className="text-[#E63329]">Live</a>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
                  // Grouped my reviews too for consistency
                  <div className="space-y-4">
                    {Object.entries(
                      myReviews.reduce((acc: Record<string, any[]>, sub: any) => {
                        const key = sub.taskId;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(sub);
                        return acc;
                      }, {} as Record<string, any[]>)
                    ).map(([taskId, subs]) => {
                      const typedSubs = subs as any[];
                      const task = tasks.get(taskId);
                      return (
                        <div key={taskId} className="card p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">{taskId}</span>
                            {task && <span className={`badge-${task.category} text-xs`}>{getCategoryLabel(task.category)}</span>}
                          </div>
                          <div className="flex gap-3 overflow-x-auto snap-x">
                            {typedSubs.map((sub: any) => (
                              <div key={sub.id} className="snap-start min-w-[260px] card p-3 text-xs">
                                <div className="font-mono">{sub.walletAddress?.slice(0,6)}...{sub.walletAddress?.slice(-4)}</div>
                                <div className="mt-1 flex justify-between">
                                  <span className={`badge-${sub.status} text-[9px]`}>{sub.status?.replace(/_/g," ")}</span>
                                  {sub.reviewTotalScore && <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span>}
                                </div>
                                {isAdmin ? (
                                  <div className="flex gap-1.5 mt-2">
                                    <button onClick={() => openReview(sub)} className="btn-primary text-xs flex-1 py-1">View Review</button>
                                    <button onClick={() => openReview(sub, { override: true })} className="px-2 py-1 rounded text-xs font-semibold border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF] flex-1">Override</button>
                                  </div>
                                ) : (
                                  <button onClick={() => openReview(sub)} className="btn-primary text-xs mt-2 w-full">
                                    Review Again
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
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

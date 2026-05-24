"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { TASKS, getCategoryLabel } from "@/lib/tasks";
import Navbar from "@/components/Navbar";

const RUBRIC_CRITERIA = [
  "Deliverable completeness — does the submission include everything listed in Required Deliverables?",
  "Quality Benchmarks met — does the submission satisfy each benchmark defined in the task spec?",
  "Technical accuracy — is the code, analysis, or content factually correct and free of critical errors?",
  "Documentation quality — is the companion documentation clear, complete, and deployment-ready?",
  "Test coverage / verification — are all claims, functions, or outputs verifiable and tested?",
  "Failure Criteria — does the submission avoid every defined failure condition?",
  "Overall standard — does the submission meet the bar expected for a paid, published deliverable?",
];

export default function ReviewerPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [scores, setScores] = useState<number[]>(new Array(7).fill(0));
  const [justifications, setJustifications] = useState<string[]>(new Array(7).fill(""));
  const [decision, setDecision] = useState<"approved" | "revision" | "rejected" | "">("");
  const [requiredChanges, setRequiredChanges] = useState("");
  const [revisionDeadline, setRevisionDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role === "contributor"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const q = query(collection(db, "submissions"), where("status", "==", "under_review"));
      const snap = await getDocs(q);
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setFetchLoading(false);
    };
    fetch();
  }, [user]);

  const openReview = (sub: any) => {
    setSelected(sub);
    setScores(sub.reviewScores || new Array(7).fill(0));
    setJustifications(sub.reviewJustifications || new Array(7).fill(""));
    setDecision(sub.reviewDecision || "");
    setRequiredChanges(sub.requiredChanges || "");
    setRevisionDeadline(sub.revisionDeadline || "");
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
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
      setSelected(null);
    } catch (err) {
      alert("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || fetchLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Reviewer Dashboard</h1>
          <p className="text-[#555555] text-sm mt-1">
            {submissions.length} submission{submissions.length !== 1 ? "s" : ""} awaiting review.
            Self-select tasks within your domain of expertise.
          </p>
        </div>

        {selected ? (
          // REVIEW PANEL
          <div>
            <button onClick={() => setSelected(null)} className="btn-ghost mb-4 text-sm">
              ← Back to submissions
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Submission details */}
              <div className="lg:col-span-1 space-y-4">
                <div className="card p-5">
                  <p className="text-xs font-mono text-[#AAAAAA] mb-1">{selected.taskId}</p>
                  <h2 className="font-bold text-[#1A1A2E] text-sm mb-3">{selected.taskTitle}</h2>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#AAAAAA]">Contributor</span>
                      <span className="font-mono text-[#1A1A2E]">{selected.walletAddress?.slice(0,6)}...{selected.walletAddress?.slice(-4)}</span>
                    </div>
                    {selected.discordHandle && (
                      <div className="flex justify-between">
                        <span className="text-[#AAAAAA]">Discord</span>
                        <span className="text-[#1A1A2E]">{selected.discordHandle}</span>
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
                    <div className="mt-4 p-3 bg-[#F0F2F5] rounded">
                      <p className="text-xs font-semibold text-[#555555] mb-1">Notes from contributor</p>
                      <p className="text-xs text-[#555555] leading-relaxed">{selected.notes}</p>
                    </div>
                  )}
                </div>

                {/* Task spec quick ref */}
                {(() => {
                  const task = TASKS.find((t) => t.id === selected.taskId);
                  return task ? (
                    <div className="card p-5">
                      <p className="text-xs font-semibold text-[#555555] mb-3 uppercase tracking-wide">Quality Benchmarks</p>
                      <ul className="space-y-1.5">
                        {task.qualityBenchmarks.map((b, i) => (
                          <li key={i} className="flex gap-2 text-xs text-[#555555]">
                            <span className="text-[#E63329] shrink-0">✓</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs font-semibold text-[#555555] mb-3 mt-4 uppercase tracking-wide">Failure Criteria</p>
                      <ul className="space-y-1.5">
                        {task.failureCriteria.map((f, i) => (
                          <li key={i} className="flex gap-2 text-xs text-[#555555]">
                            <span className="text-red-500 shrink-0">✕</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Rubric */}
              <div className="lg:col-span-2">
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-[#1A1A2E]">Review Rubric</h3>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#E63329]">{totalScore}<span className="text-base text-[#AAAAAA] font-normal">/35</span></p>
                      <p className="text-xs text-[#AAAAAA]">Total Score</p>
                    </div>
                  </div>

                  {/* Score scale */}
                  <div className="bg-[#FEF0EF] rounded p-3 mb-5 text-xs text-[#555555]">
                    <span className="font-semibold text-[#E63329]">Scale: </span>
                    1 = Does not meet standard · 2 = Partially meets · 3 = Meets standard · 4 = Exceeds · 5 = Exceptional
                  </div>

                  <div className="space-y-5">
                    {RUBRIC_CRITERIA.map((criterion, i) => (
                      <div key={i} className={`p-4 rounded ${i % 2 === 0 ? "bg-[#F0F2F5]" : "bg-white border border-[#E5E5E5]"}`}>
                        <p className="text-xs font-semibold text-[#1A1A2E] mb-3 leading-relaxed">{criterion}</p>

                        {/* Score buttons */}
                        <div className="flex gap-2 mb-3">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                const n = [...scores];
                                n[i] = s;
                                setScores(n);
                              }}
                              className={`w-9 h-9 rounded text-sm font-bold transition-colors ${
                                scores[i] === s
                                  ? "bg-[#E63329] text-white"
                                  : "bg-white border border-[#E5E5E5] text-[#555555] hover:border-[#E63329]"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                          {scores[i] > 0 && (
                            <span className="text-xs text-[#E63329] font-semibold self-center ml-1">
                              {["", "Does not meet", "Partially meets", "Meets standard", "Exceeds", "Exceptional"][scores[i]]}
                            </span>
                          )}
                        </div>

                        {/* Justification */}
                        <div>
                          <input
                            className="input text-xs"
                            placeholder="One-line justification (max 30 words)"
                            value={justifications[i]}
                            onChange={(e) => {
                              const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                              if (words.length <= 30) {
                                const n = [...justifications];
                                n[i] = e.target.value;
                                setJustifications(n);
                              }
                            }}
                          />
                          <p className="text-xs text-[#AAAAAA] mt-0.5 text-right">
                            {justifications[i].trim().split(/\s+/).filter(Boolean).length}/30 words
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Decision */}
                  <div className="mt-6 pt-6 border-t border-[#E8EBF0]">
                    <p className="label mb-3">Decision</p>
                    <div className="flex gap-3 mb-4">
                      {(["approved", "revision", "rejected"] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDecision(d)}
                          className={`px-4 py-2 rounded text-sm font-semibold transition-colors capitalize ${
                            decision === d
                              ? d === "approved" ? "bg-green-600 text-white"
                                : d === "rejected" ? "bg-red-600 text-white"
                                : "bg-yellow-500 text-white"
                              : "bg-white border border-[#E5E5E5] text-[#555555] hover:border-[#555555]"
                          }`}
                        >
                          {d === "revision" ? "Revision Requested" : d.charAt(0).toUpperCase() + d.slice(1)}
                        </button>
                      ))}
                    </div>

                    {(decision === "revision" || decision === "rejected") && (
                      <div className="space-y-3">
                        <div>
                          <label className="label">Required Changes <span className="text-xs text-[#AAAAAA] font-normal normal-case">(number each item, max 3 sentences per item)</span></label>
                          <textarea
                            className="input resize-none text-sm"
                            rows={4}
                            placeholder="1. [What needs to change, referencing the specific benchmark]&#10;2.&#10;3."
                            value={requiredChanges}
                            onChange={(e) => setRequiredChanges(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="label">Revision Deadline</label>
                          <input
                            className="input"
                            type="date"
                            value={revisionDeadline}
                            onChange={(e) => setRevisionDeadline(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      {scores.some((s) => s === 0) && (
                        <p className="text-xs text-red-500 mb-2">All 7 criteria must be scored before submitting</p>
                      )}
                      {!decision && (
                        <p className="text-xs text-red-500 mb-2">Please select a decision</p>
                      )}
                      <button
                        onClick={submitReview}
                        disabled={submitting || scores.some((s) => s === 0) || !decision}
                        className="btn-primary"
                      >
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
              </div>
            </div>
          </div>
        ) : (
          // SUBMISSIONS LIST
          <div>
            {submissions.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-[#555555] text-sm">No submissions awaiting review right now.</p>
                <p className="text-xs text-[#AAAAAA] mt-1">Check back when contributors submit their work.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {submissions.map((sub) => {
                  const task = TASKS.find((t) => t.id === sub.taskId);
                  return (
                    <div key={sub.id} className="card p-5 hover:border-[#E63329] transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-xs font-mono text-[#AAAAAA]">{sub.taskId}</p>
                          <h3 className="font-bold text-[#1A1A2E] text-sm mt-0.5">{sub.taskTitle}</h3>
                        </div>
                        {task && <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>}
                      </div>

                      <div className="text-xs text-[#555555] space-y-1 mb-4">
                        <p>Contributor: <span className="font-mono">{sub.walletAddress?.slice(0,6)}...{sub.walletAddress?.slice(-4)}</span></p>
                        {sub.discordHandle && <p>Discord: {sub.discordHandle}</p>}
                        <p>Submitted: {sub.createdAt?.toDate?.()?.toLocaleDateString()}</p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#E8EBF0]">
                        <p className="text-base font-bold text-[#E63329]">${task?.reviewerComp} reviewer comp</p>
                        <button onClick={() => openReview(sub)} className="btn-primary text-xs px-4 py-2">
                          Review This
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

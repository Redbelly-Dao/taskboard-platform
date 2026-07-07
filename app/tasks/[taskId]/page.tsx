"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, updateDoc, query, where, getDocs, doc, getDoc, serverTimestamp, runTransaction, increment } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { useUploadThing } from "@/lib/uploadthing";
import { Task, getCategoryLabel, formatReward, getRequirementsLabel } from "@/lib/tasks";
import Navbar from "@/components/Navbar";
import SubmissionChat from "@/components/SubmissionChat";
import Link from "next/link";

export default function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { user, appUser, loading } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [existingSub, setExistingSub] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);

  const [githubLink, setGithubLink] = useState("");
  const [liveLink, setLiveLink] = useState("");
  const [publishedLink, setPublishedLink] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing("submissionFile", {
    onUploadProgress: setUploadProgress,
  });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!taskId) return;
    getDoc(doc(db, "tasks", taskId)).then((snap) => {
      if (snap.exists()) setTask({ id: snap.id, ...snap.data() } as Task);
      setTaskLoading(false);
    });
  }, [taskId]);

  useEffect(() => {
    if (!user || !taskId) return;
    const q = query(collection(db, "submissions"), where("contributorId", "==", user.uid));
    getDocs(q).then((snap) => {
      const match = snap.docs.find((d) => d.data().taskId === taskId);
      if (match) setExistingSub({ id: match.id, ...match.data() });
    });
  }, [user, taskId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !appUser) {
      setSubmitError("Your profile failed to load. Sign out and sign back in, then try again.");
      return;
    }
    if (!task) return;

    // The cap lives on the (publicly readable) task doc as `submissionCount`, so
    // contributors can SEE it and we can ENFORCE it. Quick check for good UX
    // before the (slow) file upload:
    const cap = task.maxSubmissions ?? 5;
    if ((task.submissionCount ?? 0) >= cap) {
      setSubmitError(`This task has reached its submission cap (${cap}/${cap}) and is no longer accepting new submissions.`);
      return;
    }

    setSubmitError("");
    setSubmitting(true);

    try {
      let fileUrl = "";
      let fileName = "";

      if (file) {
        const res = await startUpload([file]);
        if (!res?.[0]) throw new Error("Upload failed");
        fileUrl = res[0].ufsUrl;
        fileName = file.name;
      }

      const submissionData = {
        taskId,
        taskTitle: task.title,
        contributorId: user.uid,
        walletAddress: appUser.walletAddress,
        discordHandle: appUser.discordHandle || "",
        username: appUser.username || "",
        githubLink,
        liveLink,
        publishedLink,
        notes,
        fileUrl,
        fileName,
        status: "under_review",
        reviewScore: null,
        reviewDecision: null,
        reviewFeedback: null,
        reviewerId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Atomically enforce the cap and bump the public counter. The transaction
      // re-reads the task inside the write, so two people submitting the last slot
      // at the same time cannot both get through.
      await runTransaction(db, async (tx) => {
        const taskRef = doc(db, "tasks", taskId as string);
        const snap = await tx.get(taskRef);
        const count = snap.data()?.submissionCount ?? 0;
        const capNow = snap.data()?.maxSubmissions ?? 5;
        if (count >= capNow) throw new Error("CAP_FULL");
        const subRef = doc(collection(db, "submissions"));
        tx.set(subRef, submissionData);
        tx.update(taskRef, { submissionCount: increment(1) });
      });

      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof Error && err.message === "CAP_FULL") {
        setSubmitError(`This task just reached its submission cap (${cap}/${cap}). Your submission was not recorded.`);
      } else {
        setSubmitError("Submission failed. Please check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !existingSub) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      let fileUrl = existingSub.fileUrl || "";
      let fileName = existingSub.fileName || "";
      if (file) {
        const res = await startUpload([file]);
        if (!res?.[0]) throw new Error("Upload failed");
        fileUrl = res[0].ufsUrl;
        fileName = file.name;
      }

      // Archive the round that's being superseded (what was asked, what it scored,
      // who reviewed it) instead of just overwriting it. Without this, the old
      // scores/feedback silently linger on the doc after resubmission: the
      // contributor's own page kept showing "Revision requested" with stale
      // feedback, and the next reviewer's rubric opened pre-filled with the old
      // scores as if it had already been assessed.
      const historyEntry = {
        round: existingSub.revisionCount ?? 1,
        requiredChanges: existingSub.requiredChanges || "",
        revisionDeadline: existingSub.revisionDeadline || "",
        reviewScores: existingSub.reviewScores || null,
        reviewJustifications: existingSub.reviewJustifications || null,
        reviewTotalScore: existingSub.reviewTotalScore ?? null,
        reviewerWallet: existingSub.reviewerWallet || null,
        reviewerName: existingSub.reviewerName || null,
        reviewedAt: existingSub.reviewedAt || null,
        resubmittedAt: new Date(),
      };
      const revisionHistory = [...(existingSub.revisionHistory || []), historyEntry];

      await updateDoc(doc(db, "submissions", existingSub.id), {
        githubLink,
        liveLink,
        publishedLink,
        notes,
        fileUrl,
        fileName,
        status: "under_review",
        revisionHistory,
        // clear the live review state, this round is fresh
        reviewScores: null,
        reviewJustifications: null,
        reviewTotalScore: null,
        reviewDecision: null,
        requiredChanges: null,
        revisionDeadline: null,
        updatedAt: serverTimestamp(),
      });
      setExistingSub((prev: any) => ({
        ...prev,
        status: "under_review",
        githubLink, liveLink, publishedLink, notes, fileUrl, fileName,
        revisionHistory,
        reviewScores: null,
        reviewJustifications: null,
        reviewTotalScore: null,
        reviewDecision: null,
        requiredChanges: null,
        revisionDeadline: null,
      }));
      setShowResubmit(false);
      setFile(null);
    } catch {
      setSubmitError("Resubmission failed. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || taskLoading) return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (!task) return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-[#888888]">Task not found.</p>
        <Link href="/dashboard" className="text-[#E63329] text-sm font-semibold mt-4 inline-block hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );

  const isFull = (task.submissionCount ?? 0) >= (task.maxSubmissions ?? 5);

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/dashboard" className="text-[#888888] text-sm hover:text-[#E63329] mb-6 inline-flex items-center gap-1 transition-colors">
          ← Back to dashboard
        </Link>

        {/* Task header */}
        <div className="card p-6 mb-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-mono text-[#AAAAAA]">{task.id}</span>
            <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
            <span className={`badge-${task.status}`}>{task.status.replace("_", " ")}</span>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">{task.title}</h1>
          <p className="text-sm text-[#888888] leading-relaxed mb-5">{task.shortDescription}</p>
          <div className="flex items-center gap-8 pt-4 border-t border-[#E8EBF0]">
            <div>
              <p className="text-xs text-[#AAAAAA] mb-0.5">Contributor Reward</p>
              <p className="text-2xl font-bold text-[#E63329]">
                {formatReward(task.rewardRbnt, task.reward)} <span className="text-sm font-normal text-[#888888]">{task.paymentSplit}</span>
              </p>
            </div>

            <div>
              <p className="text-xs text-[#AAAAAA] mb-0.5">Submissions</p>
              <p className={`text-lg font-bold ${(task.submissionCount ?? 0) >= (task.maxSubmissions ?? 5) ? "text-[#E63329]" : "text-[#1A1A2E]"}`}>
                {task.submissionCount ?? 0}<span className="text-sm font-normal text-[#888888]"> / {task.maxSubmissions ?? 5}</span>
              </p>
            </div>

            {/* Basic lifecycle UI - Claim/Start for assigned/in_progress */}
            {appUser?.role === "contributor" && task.status === "open" && !existingSub && (
              <button onClick={async () => {
                await updateDoc(doc(db, "tasks", taskId as string), { status: "assigned" });
                alert("Task claimed (status assigned). Start work!");
              }} className="btn-primary text-xs">Claim Task</button>
            )}
            {appUser?.role === "contributor" && task.status === "assigned" && existingSub && (
              <button onClick={async () => {
                await updateDoc(doc(db, "tasks", taskId as string), { status: "in_progress" });
              }} className="btn-secondary text-xs">Start Work</button>
            )}
            {task.reviewerComp > 0 && (
              <div>
                <p className="text-xs text-[#AAAAAA] mb-0.5">Reviewer Comp</p>
                <p className="text-lg font-bold text-[#1A1A2E]">{formatReward(task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined, task.reviewerComp)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-[#1A1A2E] mb-2 text-xs uppercase tracking-wider text-[#888888]">Problem Statement</h2>
          <p className="text-sm text-[#555555] leading-relaxed">{task.problem}</p>
        </div>

        {task.technicalRequirements && task.technicalRequirements.length > 0 && (
          <div className="card p-6 mb-4">
            <h2 className="font-bold text-xs uppercase tracking-wider text-[#888888] mb-3">{getRequirementsLabel(task.category)}</h2>
            <ul className="space-y-2">
              {task.technicalRequirements.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-[#555555]">
                  <span className="text-[#E63329] font-bold shrink-0">•</span>
                  <span className="leading-relaxed">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-xs uppercase tracking-wider text-[#888888] mb-3">Required Deliverables</h2>
          <ol className="space-y-2">
            {task.deliverables.map((d, i) => (
              <li key={i} className="flex gap-3 text-sm text-[#555555]">
                <span className="text-[#E63329] font-bold shrink-0 w-5">{i + 1}.</span>
                <span className="leading-relaxed">{d}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-xs uppercase tracking-wider text-[#888888] mb-3">Quality Benchmarks</h2>
          <ul className="space-y-2">
            {task.qualityBenchmarks.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-[#555555]">
                <span className="text-green-600 font-bold shrink-0">✓</span>
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-xs uppercase tracking-wider text-[#888888] mb-3">Failure Criteria</h2>
          <ul className="space-y-2">
            {task.failureCriteria.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-[#555555]">
                <span className="text-red-500 font-bold shrink-0">✕</span>
                <span className="leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {task.infrastructure && task.infrastructure.length > 0 && (
          <div className="card p-6 mb-6">
            <h2 className="font-bold text-xs uppercase tracking-wider text-[#888888] mb-3">Infrastructure / Resources</h2>
            <ul className="space-y-2">
              {task.infrastructure.map((r, i) => {
                const urlMatch = r.match(/(https?:\/\/\S+)/);
                if (urlMatch) {
                  const url = urlMatch[1];
                  const label = r.replace(url, "").replace(/:\s*$/, "").trim();
                  return (
                    <li key={i} className="flex gap-2 text-sm text-[#555555]">
                      <span className="text-[#AAAAAA] shrink-0">→</span>
                      <span className="leading-relaxed">
                        {label && <span>{label}: </span>}
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#E63329] hover:underline break-all">{url}</a>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={i} className="flex gap-2 text-sm text-[#555555]">
                    <span className="text-[#AAAAAA] shrink-0">→</span>
                    <span className="leading-relaxed">{r}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Submission (contributors only) */}
        {appUser?.role === "contributor" && (existingSub ? (
          <div className="card p-6 border-l-4 border-l-[#E63329]">
            <h2 className="font-bold text-[#1A1A2E] mb-3">Your Submission</h2>
            <div className="flex items-center gap-2 mb-4">
              <span className={`badge-${existingSub.status}`}>{existingSub.status.replace(/_/g, " ")}</span>
              <span className="text-xs text-[#AAAAAA]">
                Submitted {existingSub.createdAt?.toDate?.()?.toLocaleDateString()}
              </span>
            </div>

            <div className="space-y-2 text-xs mb-4">
              {existingSub.reviewTotalScore && (
                <div className="flex items-center gap-2">
                  <span className="text-[#AAAAAA]">Review score:</span>
                  <span className="font-bold text-[#E63329]">{existingSub.reviewTotalScore}/35</span>
                </div>
              )}
              {existingSub.reviewerWallet && (
                <div>
                  <span className="text-[#AAAAAA]">Reviewed by: </span>
                  <span className="font-mono text-[#555555]">
                    {existingSub.reviewerWallet.slice(0, 6)}...{existingSub.reviewerWallet.slice(-4)}
                  </span>
                </div>
              )}
            </div>

            {existingSub.reviewDecision && (
              <div className={`rounded-lg p-3 ${
                existingSub.reviewDecision === "approved"
                  ? "bg-green-50 border border-green-200"
                  : existingSub.reviewDecision === "rejected"
                  ? "bg-red-50 border border-red-200"
                  : "bg-yellow-50 border border-yellow-200"
              }`}>
                <p className="text-xs font-semibold mb-1 capitalize">{existingSub.reviewDecision.replace("_", " ")}</p>
                {existingSub.requiredChanges && (
                  <p className="text-xs text-[#555555] whitespace-pre-line">{existingSub.requiredChanges}</p>
                )}
                {existingSub.revisionDeadline && (
                  <p className="text-xs text-[#888888] mt-1">Deadline: {existingSub.revisionDeadline}</p>
                )}
              </div>
            )}

            {existingSub.adminOverride && (
              <div className="mt-3 rounded-lg p-3 bg-yellow-50 border border-yellow-200">
                <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Review</p>
                <p className="text-xs text-yellow-700">{existingSub.adminOverrideFeedback}</p>
              </div>
            )}

            {existingSub.revisionHistory && existingSub.revisionHistory.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#888888]">Revision History</p>
                {existingSub.revisionHistory.map((h: any, i: number) => (
                  <div key={i} className="rounded-lg p-3 bg-[#F4F5F7] border border-[#E8EBF0]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-[#1A1A2E]">Round {h.round ?? i + 1}</p>
                      {h.reviewTotalScore != null && <span className="text-xs font-bold text-[#E63329]">{h.reviewTotalScore}/35</span>}
                    </div>
                    {h.requiredChanges && <p className="text-xs text-[#555555] whitespace-pre-line">{h.requiredChanges}</p>}
                    {h.revisionDeadline && <p className="text-[10px] text-[#AAAAAA] mt-1">Deadline was: {h.revisionDeadline}</p>}
                  </div>
                ))}
              </div>
            )}

            {existingSub.status === "revision_requested" && (
              <div className="mt-5 pt-5 border-t border-[#E8EBF0]">
                {!showResubmit ? (
                  <button
                    onClick={() => {
                      setGithubLink(existingSub.githubLink || "");
                      setLiveLink(existingSub.liveLink || "");
                      setPublishedLink(existingSub.publishedLink || "");
                      setNotes(existingSub.notes || "");
                      setShowResubmit(true);
                    }}
                    className="btn-primary"
                  >
                    Submit Revision
                  </button>
                ) : (
                  <form onSubmit={handleResubmit} className="space-y-4">
                    <p className="text-sm font-semibold text-[#1A1A2E]">Update Your Submission</p>
                    <div className="bg-[#FEF0EF] rounded-lg p-3">
                      <p className="text-xs text-[#E63329] font-semibold mb-1">Address the reviewer&apos;s feedback</p>
                      <p className="text-xs text-[#555555]">Update the fields below and resubmit. Your submission will go back into the review queue.</p>
                    </div>
                    <div>
                      <label className="label">GitHub Repository Link</label>
                      <input className="input" type="url" placeholder="https://github.com/…" value={githubLink} onChange={(e) => setGithubLink(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Live URL <span className="text-[#AAAAAA] font-normal normal-case">(deployed app, Figma, etc.)</span></label>
                      <input className="input" type="url" placeholder="https://…" value={liveLink} onChange={(e) => setLiveLink(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Published Article or Documentation Link</label>
                      <input className="input" type="url" placeholder="https://dev.to/ or https://medium.com/…" value={publishedLink} onChange={(e) => setPublishedLink(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">File Upload <span className="text-[#AAAAAA] font-normal normal-case">(PDF, ZIP, etc., max 32MB)</span></label>
                      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.zip,.docx,.md,.mp4,.fig" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                      <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-[#E8EBF0] hover:border-[#E63329] rounded-lg p-6 text-center cursor-pointer transition-colors">
                        {file ? (
                          <p className="text-sm text-[#1A1A2E] font-semibold">{file.name}</p>
                        ) : existingSub.fileName ? (
                          <p className="text-sm text-[#555555]">Current: <span className="font-semibold">{existingSub.fileName}</span> (click to replace)</p>
                        ) : (
                          <p className="text-sm text-[#AAAAAA]">Click to upload a file</p>
                        )}
                      </div>
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div className="mt-2 bg-[#F4F5F7] rounded-full h-1.5">
                          <div className="bg-[#E63329] h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="label">Notes for Reviewer</label>
                      <textarea className="input resize-none" rows={4}
                        placeholder="Any design decisions, known limitations, or context the reviewer should know…"
                        value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                      <p className="text-xs text-[#AAAAAA] mt-1">{notes.length}/2000</p>
                    </div>
                    {submitError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-red-700 text-xs">{submitError}</p>
                      </div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button type="submit" className="btn-primary" disabled={submitting || isUploading}>
                        {isUploading ? (
                          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Uploading… {uploadProgress > 0 ? `${Math.round(uploadProgress)}%` : ""}</>
                        ) : submitting ? (
                          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                        ) : "Resubmit for Review"}
                      </button>
                      <button type="button" onClick={() => { setShowResubmit(false); setSubmitError(""); }} className="btn-secondary">Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div className="mt-5 pt-5 border-t border-[#E8EBF0]">
              <SubmissionChat
                submissionId={existingSub.id}
                taskId={existingSub.taskId}
                taskTitle={existingSub.taskTitle}
                contributorId={existingSub.contributorId}
                reviewerId={existingSub.reviewerId}
              />
            </div>
          </div>
        ) : (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#1A1A2E]">Submit Your Deliverable</h2>
              {!showForm && !isFull && (
                <button onClick={() => setShowForm(true)} className="btn-primary">Start Submission</button>
              )}
            </div>

            {isFull && (
              <div className="bg-[#F4F5F7] border border-[#E8EBF0] rounded-lg p-4 text-center">
                <p className="text-sm font-semibold text-[#1A1A2E]">Submission cap reached ({task.submissionCount ?? 0}/{task.maxSubmissions ?? 5})</p>
                <p className="text-xs text-[#888888] mt-1">This task is no longer accepting new submissions.</p>
              </div>
            )}

            {showForm && !isFull && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-[#FEF0EF] rounded-lg p-3 mb-4">
                  <p className="text-xs text-[#E63329] font-semibold mb-1">Before you submit</p>
                  <p className="text-xs text-[#555555]">
                    Make sure your submission meets every quality benchmark and avoids every failure criterion.
                    Incomplete submissions will be returned without review credit.
                  </p>
                </div>

                <div>
                  <label className="label">GitHub Repository Link</label>
                  <input className="input" type="url" placeholder="https://github.com/…" value={githubLink} onChange={(e) => setGithubLink(e.target.value)} />
                </div>
                <div>
                  <label className="label">Live URL <span className="text-[#AAAAAA] font-normal normal-case">(deployed app, Figma, etc.)</span></label>
                  <input className="input" type="url" placeholder="https://…" value={liveLink} onChange={(e) => setLiveLink(e.target.value)} />
                </div>
                <div>
                  <label className="label">Published Article or Documentation Link</label>
                  <input className="input" type="url" placeholder="https://dev.to/ or https://medium.com/…" value={publishedLink} onChange={(e) => setPublishedLink(e.target.value)} />
                </div>

                <div>
                  <label className="label">File Upload <span className="text-[#AAAAAA] font-normal normal-case">(PDF, ZIP, etc., max 32MB)</span></label>
                  <input ref={fileRef} type="file" className="hidden" accept=".pdf,.zip,.docx,.md,.mp4,.fig" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-[#E8EBF0] hover:border-[#E63329] rounded-lg p-6 text-center cursor-pointer transition-colors">
                    {file ? (
                      <p className="text-sm text-[#1A1A2E] font-semibold">{file.name}</p>
                    ) : (
                      <p className="text-sm text-[#AAAAAA]">Click to upload a file</p>
                    )}
                  </div>
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mt-2 bg-[#F4F5F7] rounded-full h-1.5">
                      <div className="bg-[#E63329] h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Notes for Reviewer</label>
                  <textarea className="input resize-none" rows={4}
                    placeholder="Any design decisions, known limitations, or context the reviewer should know…"
                    value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                  <p className="text-xs text-[#AAAAAA] mt-1">{notes.length}/2000</p>
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-xs">{submitError}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn-primary" disabled={submitting || isUploading}>
                    {isUploading ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Uploading… {uploadProgress > 0 ? `${Math.round(uploadProgress)}%` : ""}</>
                    ) : submitting ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                    ) : "Submit for Review"}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

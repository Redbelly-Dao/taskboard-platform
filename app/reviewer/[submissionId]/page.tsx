"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, onSnapshot, updateDoc, runTransaction, serverTimestamp, collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, RUBRIC_CRITERIA, displayName, getSubmissionStatusLabel, shortWallet } from "@/lib/tasks";
import Navbar from "@/components/Navbar";
import SubmissionChat from "@/components/SubmissionChat";
import { sendSubmissionMessage } from "@/lib/submission-messages";
import { StatusChips } from "@/components/reviewer/StatusChips";
import { TaskSpecCard } from "@/components/reviewer/TaskSpecCard";
import { ReadOnlyRubric } from "@/components/reviewer/ReadOnlyRubric";

// useSearchParams() (for the one-shot ?start=1 / ?override=1 actions) requires a
// Suspense boundary in the App Router.
export default function ReviewerSubmissionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
        <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ReviewerSubmissionPageInner />
    </Suspense>
  );
}

function ReviewerSubmissionPageInner() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ submissionId: string }>();
  const submissionId = params.submissionId;
  const searchParams = useSearchParams();

  const isAdmin = appUser?.role === "admin";

  const [sub, setSub] = useState<any>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subMissing, setSubMissing] = useState(false);
  const [task, setTask] = useState<Task | null>(null);

  const [formInitialized, setFormInitialized] = useState(false);
  const [oneShotHandled, setOneShotHandled] = useState(false);

  const [scores, setScores] = useState<number[]>(new Array(7).fill(0));
  const [justifications, setJustifications] = useState<string[]>(new Array(7).fill(""));
  const [decision, setDecision] = useState<"approved" | "revision" | "rejected" | "">("");
  const [requiredChanges, setRequiredChanges] = useState("");
  const [revisionDeadline, setRevisionDeadline] = useState("");
  const [revisionFollowupNotes, setRevisionFollowupNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState<"approved" | "rejected" | "">("");
  const [overrideFeedback, setOverrideFeedback] = useState("");
  const [overriding, setOverriding] = useState(false);

  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [handingOff, setHandingOff] = useState(false);

  // Whether WE currently hold the reviewing lock on this submission, tracked
  // ourselves (not just derived from `sub`) so cleanup on unmount/tab-close
  // knows to release it even if the live snapshot hasn't caught up yet.
  const heldLockRef = useRef(false);
  const subRef = useRef<any>(null);
  useEffect(() => { subRef.current = sub; }, [sub]);

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role === "contributor"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  // Live: this page always fetches its own submission directly by ID, rather
  // than depending on it already being present in a list loaded elsewhere.
  // Stays current if someone else acts on it while this page is open.
  useEffect(() => {
    if (!submissionId) return;
    const unsub = onSnapshot(doc(db, "submissions", submissionId), (snap) => {
      if (!snap.exists()) {
        setSubMissing(true);
        setSubLoading(false);
        return;
      }
      setSub({ id: snap.id, ...snap.data() });
      setSubLoading(false);
    });
    return unsub;
  }, [submissionId]);

  // Task metadata for the spec card, fetched once the submission tells us the taskId.
  useEffect(() => {
    if (!sub?.taskId) return;
    getDoc(doc(db, "tasks", sub.taskId)).then((snap) => {
      if (snap.exists()) setTask({ id: snap.id, ...snap.data() } as Task);
    });
  }, [sub?.taskId]);

  // Initialize the rubric form ONCE from the submission's current values, not on
  // every live update, so a reviewer's in-progress typing is never clobbered by
  // an unrelated field changing elsewhere on the same doc.
  useEffect(() => {
    if (sub && !formInitialized) {
      setScores(sub.reviewScores || new Array(7).fill(0));
      setJustifications(sub.reviewJustifications || new Array(7).fill(""));
      setDecision(sub.reviewDecision || "");
      setRequiredChanges(sub.requiredChanges || "");
      setRevisionDeadline(sub.revisionDeadline || "");
      setRevisionFollowupNotes(sub.revisionFollowupNotes || "");
      setFormInitialized(true);
    }
  }, [sub, formInitialized]);

  // Release the lock we hold if the tab is closed or refreshed.
  useEffect(() => {
    const release = () => {
      if (heldLockRef.current && submissionId) {
        updateDoc(doc(db, "submissions", submissionId), { reviewingBy: null, reviewingByWallet: null, reviewingByName: null }).catch(() => {});
        heldLockRef.current = false;
      }
    };
    window.addEventListener("beforeunload", release);
    return () => {
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, [submissionId]);

  const isActive = sub?.status === "under_review";
  const holdingLock = isActive && sub?.reviewingBy === user?.uid;
  const lockedByOther = isActive && sub?.reviewingBy && sub.reviewingBy !== user?.uid;
  const outOfCategory =
    isActive && !isAdmin && !!appUser?.reviewerCategories && appUser.reviewerCategories.length > 0 &&
    !!task && !appUser.reviewerCategories.includes(task.category as TaskCategory);
  // Conflict of interest: a reviewer who has submitted to this task themselves
  // can't review anyone's submission for it. Real enforcement is in
  // firestore.rules; this just surfaces the same block in the UI.
  const ownTask = !isAdmin && !!sub?.taskId && !!(appUser?.submittedTaskIds ?? []).includes(sub.taskId);
  const blockedForNonAdmin = !isAdmin && (lockedByOther || outOfCategory || ownTask);

  // Claim the review lock. Fires the "review started" auto-message once per round.
  const startReview = async () => {
    if (!sub || !user || !appUser || isActive === false) return;
    const patch: Record<string, unknown> = {
      reviewingBy: user.uid,
      reviewingByWallet: appUser.walletAddress,
      reviewingByName: appUser.username || appUser.discordHandle || null,
      handoffRequested: false,
      handoffToWallet: null,
      handoffNote: null,
      handoffBy: null,
    };
    if (!sub.reviewStartedNotified) {
      patch.reviewStartedNotified = true;
      sendSubmissionMessage({
        submissionId: sub.id,
        taskId: sub.taskId,
        taskTitle: sub.taskTitle,
        senderId: user.uid,
        senderWallet: appUser.walletAddress,
        senderRole: appUser.role,
        message: "Hi! I've started reviewing your submission for this task. I'll share feedback here once it's complete.",
        contributorId: sub.contributorId,
      }).catch(() => {});
    }
    try {
      await updateDoc(doc(db, "submissions", sub.id), patch);
      heldLockRef.current = true;
    } catch {
      alert("Could not claim this submission for review, someone may have just taken it. Refresh and try again.");
    }
  };

  // One-shot actions from a queue link: ?start=1 auto-claims, ?override=1 opens the
  // override form. Each fires at most once, then strips itself from the URL. For a
  // non-admin ?start=1, wait for `task` to resolve first, otherwise the category
  // check below would race against the task fetch and could evaluate against a
  // not-yet-loaded task, letting an out-of-category claim slip through.
  useEffect(() => {
    if (!sub || !formInitialized || oneShotHandled || !user) return;
    const start = searchParams.get("start");
    const override = searchParams.get("override");
    if (start && !isAdmin && !task) return;
    setOneShotHandled(true);
    if (start && isActive && !sub.reviewingBy && !blockedForNonAdmin) {
      startReview();
    } else if (override && isAdmin && !isActive) {
      setShowOverrideForm(true);
    }
    if (start || override) router.replace(`/reviewer/${submissionId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, formInitialized, oneShotHandled, user, task, isAdmin]);

  const goBack = () => router.push("/reviewer");

  const releaseLock = async () => {
    if (!sub) return;
    await updateDoc(doc(db, "submissions", sub.id), { reviewingBy: null, reviewingByWallet: null, reviewingByName: null }).catch(() => {});
    heldLockRef.current = false;
    goBack();
  };

  const requestHandoff = async () => {
    if (!sub) return;
    setHandingOff(true);
    const target = handoffTarget.trim().toLowerCase() || null;
    const note = handoffNote.trim() || null;
    try {
      await updateDoc(doc(db, "submissions", sub.id), {
        handoffRequested: true,
        handoffToWallet: target,
        handoffNote: note,
        handoffBy: appUser?.walletAddress || null,
        reviewingBy: null,
        reviewingByWallet: null,
        reviewingByName: null,
        updatedAt: serverTimestamp(),
      });
      heldLockRef.current = false;
      goBack();
    } catch {
      alert("Failed to request a hand-off. Please try again.");
    } finally {
      setHandingOff(false);
    }
  };

  // Cap counts only ACTIVE (non-rejected) submissions, so a rejection frees a slot.
  const recountTaskActive = async (taskId: string) => {
    try {
      const snap = await getDocs(query(collection(db, "submissions"), where("taskId", "==", taskId)));
      const active = snap.docs.filter((d) => d.data().status !== "rejected").length;
      await updateDoc(doc(db, "tasks", taskId), { submissionCount: active });
    } catch { /* self-heals on the next decision */ }
  };

  const totalScore = scores.reduce((a, b) => a + b, 0);
  const revisionAlreadyUsed = (sub?.revisionCount ?? 0) >= 1;

  const submitReview = async () => {
    if (!sub || !decision || scores.some((s) => s === 0)) return;
    if (decision === "revision" && revisionAlreadyUsed) return;
    setSubmitting(true);
    try {
      // Once a review is issued, it's locked: only the reviewer who holds the
      // claim can issue it, and only while still under_review. A second
      // reviewer's stale screen can no longer overwrite a decision another
      // reviewer already submitted moments earlier.
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "submissions", sub.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("NOT_FOUND");
        const current = snap.data() as any;
        if (current.status !== "under_review") throw new Error("ALREADY_DECIDED");
        if (current.reviewingBy !== user?.uid) throw new Error("LOCK_LOST");
        if (decision === "revision" && (current.revisionCount || 0) >= 1) throw new Error("REVISION_ALREADY_USED");

        tx.update(ref, {
          status: decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "revision_requested",
          reviewDecision: decision,
          reviewScores: scores,
          reviewJustifications: justifications,
          reviewTotalScore: totalScore,
          requiredChanges,
          revisionDeadline,
          revisionFollowupNotes: revisionFollowupNotes || null,
          ...(decision === "revision" ? { revisionCount: (current.revisionCount || 0) + 1 } : {}),
          reviewerId: user?.uid,
          reviewerWallet: appUser?.walletAddress,
          reviewerName: appUser?.username || appUser?.discordHandle || null,
          reviewingBy: null,
          reviewingByWallet: null,
          reviewingByName: null,
          handoffRequested: false,
          handoffToWallet: null,
          reviewedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      heldLockRef.current = false;
      await recountTaskActive(sub.taskId);
      goBack();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "ALREADY_DECIDED") {
        alert("This submission was already decided by another reviewer.");
        goBack();
      } else if (code === "LOCK_LOST") {
        alert("Your claim on this submission is no longer active. Reopen it to try again.");
        goBack();
      } else if (code === "REVISION_ALREADY_USED") {
        alert("This submission already used its one revision opportunity. Please choose Approved or Rejected.");
      } else {
        alert("Failed to submit review. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const applyOverride = async () => {
    if (!sub || !overrideDecision || !overrideFeedback.trim()) return;
    setOverriding(true);
    try {
      await updateDoc(doc(db, "submissions", sub.id), {
        status: overrideDecision === "approved" ? "approved" : "rejected",
        reviewDecision: overrideDecision,
        adminOverride: true,
        adminOverrideBy: user?.uid,
        adminOverrideWallet: appUser?.walletAddress,
        adminOverrideName: appUser?.username || appUser?.discordHandle || null,
        adminOverrideFeedback: overrideFeedback,
        reviewingBy: null,
        reviewingByWallet: null,
        adminOverrideAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recountTaskActive(sub.taskId);
      goBack();
    } catch {
      alert("Override failed. Please try again.");
    } finally {
      setOverriding(false);
    }
  };

  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
        <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (subMissing) {
    return (
      <div className="min-h-screen bg-[#F4F5F7]">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-[#555555] text-sm mb-4">That submission could not be found. It may have been removed.</p>
          <button onClick={goBack} className="btn-primary">Back to submissions</button>
        </div>
      </div>
    );
  }

  const isReviewed = sub && sub.status !== "under_review";

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={goBack} className="btn-ghost mb-4 text-sm">
          {holdingLock ? "Back (releases your lock)" : "Back to submissions"}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: task spec, submission, chat */}
          <div className="lg:col-span-1 space-y-4">
            <TaskSpecCard task={task} />

            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-2">Submission</p>
              <div className="mb-3"><StatusChips sub={sub} currentUserId={user?.uid} isAdmin={isAdmin} /></div>

              <div className="space-y-3 text-xs">
                <div>
                  <p className="text-[#AAAAAA] mb-0.5">Submitted by</p>
                  <p className="text-sm font-semibold text-[#1A1A2E]">{displayName(sub.username, sub.discordHandle, sub.walletAddress)}</p>
                  <p className="font-mono text-[10px] text-[#AAAAAA] break-all">{sub.walletAddress}</p>
                </div>
                {sub.discordHandle && (
                  <div className="flex justify-between">
                    <span className="text-[#AAAAAA]">Discord</span>
                    <span className="text-[#1A1A2E]">{sub.discordHandle}</span>
                  </div>
                )}
                {sub.reviewerWallet && (
                  <div>
                    <p className="text-[#AAAAAA] mb-0.5">Reviewed by</p>
                    <p className="text-sm font-semibold text-[#1A1A2E]">{displayName(sub.reviewerName, undefined, sub.reviewerWallet)}</p>
                    <p className="font-mono text-[10px] text-[#AAAAAA] break-all">{sub.reviewerWallet}</p>
                  </div>
                )}
                {sub.adminOverrideWallet && (
                  <div>
                    <p className="text-[#AAAAAA] mb-0.5">Admin override by</p>
                    <p className="text-sm font-semibold text-[#1A1A2E]">{displayName(sub.adminOverrideName, undefined, sub.adminOverrideWallet)}</p>
                    <p className="font-mono text-[10px] text-[#AAAAAA] break-all">{sub.adminOverrideWallet}</p>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {sub.githubLink && (
                  <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">GitHub Repository →</a>
                )}
                {sub.liveLink && (
                  <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">Live URL →</a>
                )}
                {sub.publishedLink && (
                  <a href={sub.publishedLink} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">Published Article →</a>
                )}
                {sub.fileUrl && (
                  <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">Download File: {sub.fileName} →</a>
                )}
              </div>

              {sub.notes && (
                <div className="mt-4 p-3 bg-[#F4F5F7] rounded-lg">
                  <p className="text-xs font-semibold text-[#555555] mb-1">Notes from contributor</p>
                  <p className="text-xs text-[#555555] leading-relaxed whitespace-pre-line">{sub.notes}</p>
                </div>
              )}
            </div>

            <div className="card p-5">
              <SubmissionChat
                submissionId={sub.id}
                taskId={sub.taskId}
                taskTitle={sub.taskTitle}
                contributorId={sub.contributorId}
                reviewerId={sub.reviewerId}
              />
            </div>
          </div>

          {/* Right column: sticky + independently scrollable so a long task
              description on the left doesn't leave this stranded with blank
              space once its own content runs out. */}
          <div className="lg:col-span-2 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
            {isReviewed ? (
              isAdmin ? (
                showOverrideForm ? (
                  <div className="card p-6">
                    <button onClick={() => setShowOverrideForm(false)} className="text-xs text-[#E63329] mb-3 hover:underline flex items-center gap-1">← Back to review details</button>
                    <div className="mb-6 pb-6 border-b border-[#E8EBF0]">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Original Review</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#F4F5F7] rounded-lg p-3">
                          <p className="text-xs text-[#AAAAAA] mb-1">Score</p>
                          <p className="text-xl font-bold text-[#E63329]">{sub.reviewTotalScore ?? "?"}<span className="text-sm font-normal text-[#AAAAAA]">/35</span></p>
                        </div>
                        <div className="bg-[#F4F5F7] rounded-lg p-3">
                          <p className="text-xs text-[#AAAAAA] mb-1">Decision</p>
                          <p className="text-sm font-semibold text-[#1A1A2E] capitalize">{sub.reviewDecision ?? "none"}</p>
                        </div>
                        <div className="bg-[#F4F5F7] rounded-lg p-3">
                          <p className="text-xs text-[#AAAAAA] mb-1">Status</p>
                          <span className={`badge-${sub.status}`}>{getSubmissionStatusLabel(sub.status)}</span>
                        </div>
                      </div>
                      {sub.adminOverride && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">Previously overridden by admin</p>
                          <p className="text-xs text-yellow-700">{sub.adminOverrideFeedback}</p>
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
                              overrideDecision === d ? (d === "approved" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#555555]"
                            }`}>{d.charAt(0).toUpperCase() + d.slice(1)}</button>
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
                    {(!overrideDecision || !overrideFeedback.trim()) && <p className="text-xs text-red-500 mb-3">Select a new decision and provide a reason to continue</p>}
                    <button onClick={applyOverride} disabled={overriding || !overrideDecision || !overrideFeedback.trim()} className="btn-primary">
                      {overriding ? (<span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Applying Override...</span>) : "Apply Override"}
                    </button>
                  </div>
                ) : (
                  <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-[#1A1A2E]">Review Details</h3>
                      <button onClick={() => setShowOverrideForm(true)} className="btn-primary text-xs px-4 py-2">Override Decision</button>
                    </div>
                    <ReadOnlyRubric sub={sub} />
                    <div className="mt-4 text-xs text-[#888888]">Click "Override Decision" above if you need to change this review.</div>
                  </div>
                )
              ) : (
                <div className="card p-6">
                  <h3 className="font-bold text-[#1A1A2E] mb-4">Review Details (read-only)</h3>
                  <ReadOnlyRubric sub={sub} />
                </div>
              )
            ) : holdingLock ? (
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
                          <button key={s} type="button" onClick={() => { const n = [...scores]; n[i] = s; setScores(n); }}
                            className={`w-9 h-9 rounded text-sm font-bold transition-colors ${scores[i] === s ? "bg-[#E63329] text-white" : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#E63329]"}`}>{s}</button>
                        ))}
                        {scores[i] > 0 && (
                          <span className="text-xs text-[#E63329] font-semibold self-center ml-1">{["", "Does not meet", "Partially meets", "Meets standard", "Exceeds", "Exceptional"][scores[i]]}</span>
                        )}
                      </div>
                      <div>
                        <input className="input text-xs" placeholder="One-line justification (max 30 words)" value={justifications[i]}
                          onChange={(e) => { const words = e.target.value.trim().split(/\s+/).filter(Boolean); if (words.length <= 30) { const n = [...justifications]; n[i] = e.target.value; setJustifications(n); } }} />
                        <p className="text-xs text-[#AAAAAA] mt-0.5 text-right">{justifications[i].trim().split(/\s+/).filter(Boolean).length}/30 words</p>
                      </div>
                    </div>
                  ))}
                </div>

                {sub.revisionHistory && sub.revisionHistory.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-[#E8EBF0] space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#888888]">Revision history (read-only)</p>
                    {sub.revisionHistory.map((h: any, i: number) => (
                      <div key={i} className="p-3 bg-[#F4F5F7] rounded-lg text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-[#1A1A2E]">
                            Round {h.round ?? i + 1}{(h.reviewerName || h.reviewerWallet) ? ` (${h.reviewerName || shortWallet(h.reviewerWallet)})` : ""}
                          </span>
                          {h.reviewTotalScore != null && <span className="font-bold text-[#E63329]">{h.reviewTotalScore}/35</span>}
                        </div>
                        {h.requiredChanges && <p className="text-[#555555] whitespace-pre-line">{h.requiredChanges}</p>}
                      </div>
                    ))}
                    <div>
                      <label className="label">Were the requested changes addressed? <span className="text-[#AAAAAA] font-normal normal-case">(optional note)</span></label>
                      <textarea className="input text-xs resize-none" rows={2}
                        placeholder="e.g. Yes, all items fixed. / Partially, item 2 still missing."
                        value={revisionFollowupNotes} onChange={(e) => setRevisionFollowupNotes(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-[#E8EBF0]">
                  <p className="label mb-3">Decision</p>
                  <div className="flex gap-3 mb-4 flex-wrap">
                    {(["approved", "revision", "rejected"] as const).map((d) => {
                      const disabled = d === "revision" && revisionAlreadyUsed;
                      return (
                        <button key={d} type="button" disabled={disabled} onClick={() => !disabled && setDecision(d)}
                          className={`px-4 py-2 rounded text-sm font-semibold transition-colors capitalize ${
                            disabled
                              ? "bg-[#F4F5F7] text-[#AAAAAA] border border-[#E8EBF0] cursor-not-allowed"
                              : decision === d ? (d === "approved" ? "bg-green-600 text-white" : d === "rejected" ? "bg-red-600 text-white" : "bg-yellow-500 text-white") : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#555555]"
                          }`}>
                          {d === "revision" ? "Revision Requested" : d.charAt(0).toUpperCase() + d.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                  {revisionAlreadyUsed && (
                    <p className="text-[11px] text-[#888888] mb-3">
                      This submission already used its one revision opportunity. A final decision (Approved or Rejected) is required.
                    </p>
                  )}

                  {(decision === "revision" || decision === "rejected") && (
                    <div className="space-y-3">
                      <div>
                        <label className="label">Required Changes <span className="text-xs text-[#AAAAAA] font-normal normal-case">(number each item, max 3 sentences per item)</span></label>
                        <textarea className="input resize-none text-sm" rows={4} placeholder="1. [What needs to change, referencing the specific benchmark]&#10;2.&#10;3." value={requiredChanges} onChange={(e) => setRequiredChanges(e.target.value)} />
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
                      {submitting ? (<span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting Review...</span>) : "Submit Review"}
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-[#E8EBF0]">
                  <p className="text-xs font-semibold text-[#555555] mb-1">Not the right reviewer for this one?</p>
                  <p className="text-[11px] text-[#AAAAAA] mb-3">Release it back to the queue, or ask another reviewer to take it. Nothing you have typed above is saved.</p>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={releaseLock} className="btn-secondary text-xs px-3 py-1.5">Release (give up)</button>
                    <button onClick={() => setShowHandoff((v) => !v)} className="btn-secondary text-xs px-3 py-1.5">{showHandoff ? "Cancel hand-off" : "Request another reviewer"}</button>
                  </div>
                  {showHandoff && (
                    <div className="mt-3 space-y-2 bg-[#F4F5F7] rounded-lg p-3">
                      <input className="input text-xs" placeholder="Target reviewer wallet or handle (optional, leave blank for anyone)" value={handoffTarget} onChange={(e) => setHandoffTarget(e.target.value)} />
                      <textarea className="input text-xs resize-none" rows={2} placeholder="Note (optional): why you are passing it on" value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} />
                      <button onClick={requestHandoff} disabled={handingOff} className="btn-primary text-xs px-3 py-1.5">
                        {handingOff ? "Sending..." : "Send hand-off request"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card p-6">
                <h3 className="font-bold text-[#1A1A2E] mb-2">Preview</h3>
                <p className="text-xs text-[#888888] mb-5">
                  You are viewing this submission without claiming it. Read the task spec and the submission on the left to decide if it is yours to take.
                </p>

                {sub.handoffRequested && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    A hand-off was requested{sub.handoffToWallet ? ` for ${shortWallet(sub.handoffToWallet)}` : " (open to any reviewer)"}.
                    {sub.handoffNote && <span className="block mt-1 text-amber-700">"{sub.handoffNote}"</span>}
                  </div>
                )}

                {blockedForNonAdmin ? (
                  <div className="p-4 bg-[#F4F5F7] rounded-lg text-sm text-[#555555]">
                    {lockedByOther
                      ? <>Currently being reviewed by <span className="font-semibold">{sub.reviewingByName || shortWallet(sub.reviewingByWallet)}</span>. You can read it, but cannot start until they release it.</>
                      : ownTask
                      ? "You submitted to this task yourself, so you can't review it."
                      : "This submission is outside your review category."}
                  </div>
                ) : isActive ? (
                  <button onClick={startReview} className="btn-primary">
                    Start review (locks it to you and opens scoring)
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

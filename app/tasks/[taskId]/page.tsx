"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, updateDoc, query, where, doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp, runTransaction, increment, arrayUnion } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { useUploadThing } from "@/lib/uploadthing";
import { Task, Submission, getCategoryLabel, formatReward, getRequirementsLabel, getSubmissionStatusLabel, displayName, SUBMISSION_CYCLE_CAP, RUBRIC_CRITERIA, getRejectionReasonLabel } from "@/lib/tasks";
import { Cycle, isFrozen } from "@/lib/cycle";
import { Claim, claimExpiry, isClaimActive, slotsRemaining, CLAIM_DAYS } from "@/lib/claims";
import { Appeal, AppealType, APPEAL_WINDOW_DAYS, APPEAL_STATEMENT_MAX, criterionShortLabel, withinAppealWindow } from "@/lib/appeals";
import AppShell from "@/components/AppShell";
import SubmissionChat from "@/components/SubmissionChat";
import RevisionCountdown from "@/components/RevisionCountdown";
import Link from "next/link";
import { sendSubmissionMessage } from "@/lib/submission-messages";
import { notifyAppealFiled } from "@/lib/notifications";

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

  // Live so a reviewer's decision (approval / revision / rejection) lands here without a manual refresh.
  // Prefer an active (non-withdrawn) submission; fall back to the most recent one otherwise.
  useEffect(() => {
    if (!user || !taskId) return;
    const q = query(collection(db, "submissions"), where("contributorId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const mine = snap.docs.filter((d) => d.data().taskId === taskId).map((d) => ({ id: d.id, ...d.data() } as any));
      const active = mine.find((m) => m.status !== "withdrawn");
      setExistingSub(active ?? mine[mine.length - 1] ?? null);
    });
    return () => unsub();
  }, [user, taskId]);

  // Submission cycle: the batch counter plus its dates (admin Cycle page).
  // Each new submission is stamped with `current`; `freezeAt` closes new submissions.
  const [cycleConfig, setCycleConfig] = useState<Cycle | null>(null);
  const cycle = cycleConfig?.current ?? null;
  useEffect(() => {
    getDoc(doc(db, "config", "cycle")).then((snap) => {
      setCycleConfig(snap.exists() ? ({ current: 1, ...snap.data() } as Cycle) : { current: 1 });
    });
  }, []);

  // Slot reservations (B6): live so remaining slots reflect other people's claims the moment they change.
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claiming, setClaiming] = useState(false);
  useEffect(() => {
    if (!taskId) return;
    const unsub = onSnapshot(collection(db, "tasks", taskId, "claims"), (snap) => {
      setClaims(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as Claim)));
    }, () => { /* claims are best-effort; never block the page */ });
    return () => unsub();
  }, [taskId]);

  // Reserve a slot (B6). Held for CLAIM_DAYS, never past the freeze.
  const claimSlot = async () => {
    if (!user || !appUser || !taskId) return;
    setClaiming(true);
    try {
      await setDoc(doc(db, "tasks", taskId, "claims", user.uid), {
        uid: user.uid,
        wallet: appUser.walletAddress,
        name: appUser.username || appUser.discordHandle || "",
        claimedAt: serverTimestamp(),
        expiresAt: claimExpiry(cycleConfig),
      });
    } catch {
      /* non-blocking */
    } finally {
      setClaiming(false);
    }
  };

  const releaseClaim = async () => {
    if (!user || !taskId) return;
    await deleteDoc(doc(db, "tasks", taskId, "claims", user.uid)).catch(() => {});
  };

  // Appeals (rulebook 09): live, keyed by submission id (enforced one-per-submission by the doc id in firestore.rules).
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [appealLoaded, setAppealLoaded] = useState(false);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealCriterion, setAppealCriterion] = useState(0);
  const [appealStatement, setAppealStatement] = useState("");
  const [filingAppeal, setFilingAppeal] = useState(false);
  const [appealError, setAppealError] = useState("");

  // No submission yet: nothing to subscribe to, so `appeal` stays as-is.
  // (The appeal section only renders once activeSub exists anyway.)
  useEffect(() => {
    if (!existingSub?.id) return;
    const unsub = onSnapshot(doc(db, "appeals", existingSub.id), (snap) => {
      setAppeal(snap.exists() ? ({ id: snap.id, ...snap.data() } as Appeal) : null);
      setAppealLoaded(true);
    });
    return () => unsub();
  }, [existingSub?.id]);

  // Public ledger doc (world-readable, no PII).
  // The only way this page learns whether a different submission won, since contributors can't list others' submissions.
  // Only the one field this page actually reads is typed.
  const [ledgerDoc, setLedgerDoc] = useState<{ winnerSubmissionId?: string | null } | null>(null);
  useEffect(() => {
    if (!taskId || task?.status !== "completed") return;
    const unsub = onSnapshot(doc(db, "ledger", taskId), (snap) => {
      setLedgerDoc(snap.exists() ? snap.data() : null);
    }, () => { /* ledger read is best-effort for this hint */ });
    return () => unsub();
  }, [taskId, task?.status]);

  // Forfeit a submission that is still waiting for a reviewer (before review has started).
  // This frees the slot and bans the contributor from re-submitting to this task for the current cycle.
  // The withdrawn doc (with its cycle) is the ban marker, and its cycle is what gates a fresh submission next cycle.
  const [withdrawing, setWithdrawing] = useState(false);
  const handleWithdraw = async () => {
    if (!user || !existingSub || !taskId) return;
    if (!window.confirm("Forfeit this submission? This frees your slot, and you will not be able to submit to this task again for this cycle.")) return;
    setWithdrawing(true);
    setSubmitError("");
    try {
      await updateDoc(doc(db, "submissions", existingSub.id), {
        status: "withdrawn",
        withdrawnAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "tasks", taskId), { submissionCount: increment(-1) }).catch(() => {});
    } catch {
      setSubmitError("Could not forfeit right now. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !appUser) {
      setSubmitError("Your profile failed to load. Sign out and sign back in, then try again.");
      return;
    }
    if (!task) return;

    if (task.status === "completed" || task.status === "paused") {
      setSubmitError(task.status === "completed"
        ? "This task is completed and no longer accepting submissions."
        : "This task is paused and not accepting submissions right now.");
      return;
    }

    // Submission freeze (B1): new submissions close before the cycle ends so there is time to review.
    // Resubmissions against an open revision use a separate path and are unaffected.
    if (isFrozen(cycleConfig)) {
      setSubmitError("Submissions for this cycle have closed. New work opens next cycle.");
      return;
    }

    // Conflict of interest (B2): a reviewer assigned to this task cannot submit to it.
    // Enforced here, on the reviewer queue, and in the rules.
    if (task.reviewerId && task.reviewerId === user.uid) {
      setSubmitError("You are the assigned reviewer for this task, so you cannot submit to it.");
      return;
    }

    // The cap lives on the (public) task doc as `submissionCount`, so contributors can SEE it and we can ENFORCE it.
    // Quick check for good UX before the (slow) file upload:
    const cap = task.maxSubmissions ?? 5;
    if ((task.submissionCount ?? 0) >= cap) {
      setSubmitError(`This task has reached its submission cap (${cap}/${cap}) and is no longer accepting new submissions.`);
      return;
    }

    // Per-cycle personal cap: total submissions this user may make across all tasks in the current cycle.
    // (2 for reviewers, 4 for contributors.)
    const role = appUser.role as "contributor" | "reviewer";
    const cycleCap = SUBMISSION_CYCLE_CAP[role];
    const usedThisCycle = cycle != null ? (appUser.cycleCounts?.[String(cycle)] ?? 0) : 0;
    if (cycle != null && usedThisCycle >= cycleCap) {
      setSubmitError(`You've used all ${cycleCap} of your submissions for this cycle. Check back next cycle.`);
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

      // Atomically enforce every cap and bump the counters.
      // The transaction re-reads the task, config, and user docs inside the write.
      // So two people submitting the last slot (or a user's last cycle slot) at once can't both get through.
      await runTransaction(db, async (tx) => {
        const taskRef = doc(db, "tasks", taskId as string);
        const userRef = doc(db, "users", user.uid);
        const cycleRef = doc(db, "config", "cycle");
        const [taskSnap, userSnap, cycleSnap] = await Promise.all([tx.get(taskRef), tx.get(userRef), tx.get(cycleRef)]);

        if (["completed", "paused"].includes(taskSnap.data()?.status)) throw new Error("TASK_UNAVAILABLE");

        const count = taskSnap.data()?.submissionCount ?? 0;
        const capNow = taskSnap.data()?.maxSubmissions ?? 5;
        if (count >= capNow) throw new Error("CAP_FULL");

        const currentCycle = cycleSnap.exists() ? (cycleSnap.data().current ?? 1) : 1;
        const cycleCapNow = SUBMISSION_CYCLE_CAP[appUser.role as "contributor" | "reviewer"];
        const usedNow = userSnap.data()?.cycleCounts?.[String(currentCycle)] ?? 0;
        if (usedNow >= cycleCapNow) throw new Error("CYCLE_CAP_FULL");

        const subRef = doc(collection(db, "submissions"));
        tx.set(subRef, { ...submissionData, cycle: currentCycle });
        tx.update(taskRef, { submissionCount: increment(1) });
        tx.update(userRef, {
          submittedTaskIds: arrayUnion(taskId),
          [`cycleCounts.${currentCycle}`]: increment(1),
        });
      });

      // Your reservation is consumed once you've submitted, so it stops holding a slot for you.
      // (Best-effort; an expired claim would be ignored anyway.)
      await deleteDoc(doc(db, "tasks", taskId as string, "claims", user.uid)).catch(() => {});

      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof Error && err.message === "CAP_FULL") {
        setSubmitError(`This task just reached its submission cap (${cap}/${cap}). Your submission was not recorded.`);
      } else if (err instanceof Error && err.message === "TASK_UNAVAILABLE") {
        setSubmitError("This task stopped accepting submissions just now. Your submission was not recorded.");
      } else if (err instanceof Error && err.message === "CYCLE_CAP_FULL") {
        setSubmitError("You just used your last submission for this cycle. Your submission was not recorded.");
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

      // Archive the round being superseded (what was asked, scored, and reviewed) instead of overwriting it.
      // Without this, the old scores/feedback silently linger on the doc after resubmission.
      // The contributor's own page kept showing "Revision requested" with stale feedback.
      // And the next reviewer's rubric opened pre-filled with the old scores as if already assessed.
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
      // Also kept as a top-level field.
      // The reviewer clock (re-review due 2 days from here) reads it off the submission, not the history array.
      const resubmittedAt = historyEntry.resubmittedAt;

      await updateDoc(doc(db, "submissions", existingSub.id), {
        githubLink,
        liveLink,
        publishedLink,
        notes,
        fileUrl,
        fileName,
        status: "under_review",
        revisionHistory,
        resubmittedAt,
        // clear the live review state, this round is fresh
        reviewScores: null,
        reviewJustifications: null,
        reviewTotalScore: null,
        reviewDecision: null,
        requiredChanges: null,
        revisionDeadline: null,
        // let the "review started" auto-message fire again for this new round
        // and clear the sweep's flags so the new round gets its own reminder/overdue pass
        reviewStartedNotified: false,
        revisionReminderSent: false,
        reviewOverdueNotified: false,
        updatedAt: serverTimestamp(),
      });
      setExistingSub((prev: any) => ({
        ...prev,
        status: "under_review",
        githubLink, liveLink, publishedLink, notes, fileUrl, fileName,
        revisionHistory,
        resubmittedAt,
        reviewScores: null,
        reviewJustifications: null,
        reviewTotalScore: null,
        reviewDecision: null,
        requiredChanges: null,
        revisionDeadline: null,
        reviewStartedNotified: false,
        revisionReminderSent: false,
        reviewOverdueNotified: false,
      }));

      if (user && appUser && task) {
        sendSubmissionMessage({
          submissionId: existingSub.id,
          taskId: taskId as string,
          taskTitle: task.title,
          senderId: user.uid,
          senderWallet: appUser.walletAddress,
          senderName: appUser.username || appUser.discordHandle || undefined,
          senderRole: appUser.role,
          message: `Revision resubmitted (round ${historyEntry.round}). I've addressed the requested changes: it's ready for re-review.`,
          reviewerId: existingSub.reviewerId,
        }).catch(() => { /* non-blocking */ });
      }

      setShowResubmit(false);
      setFile(null);
    } catch {
      setSubmitError("Resubmission failed. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // File an appeal (rulebook 09).
  // The doc id is the submission id, so a second attempt just fails the rules' create check instead of duplicating.
  const handleFileAppeal = async (e: React.FormEvent, appealType: AppealType) => {
    e.preventDefault();
    if (!user || !appUser || !task || !existingSub) return;
    const statement = appealStatement.trim().slice(0, APPEAL_STATEMENT_MAX);
    if (!statement) return;
    setFilingAppeal(true);
    setAppealError("");
    try {
      await setDoc(doc(db, "appeals", existingSub.id), {
        submissionId: existingSub.id,
        taskId: task.id,
        taskNumber: task.number,
        taskTitle: task.title,
        contributorId: user.uid,
        contributorName: displayName(appUser.username, appUser.discordHandle, appUser.walletAddress),
        type: appealType,
        criterionIndex: appealCriterion,
        statement,
        status: "open",
        createdAt: serverTimestamp(),
        decidedAt: null,
        adminNote: null,
        cosignedBy: null,
        cycle: existingSub.cycle ?? null,
      });
      await notifyAppealFiled({
        submissionId: existingSub.id,
        taskId: task.id,
        taskTitle: task.title,
        senderWallet: appUser.walletAddress,
        senderRole: appUser.role,
        appealType,
      });
      setShowAppealForm(false);
      setAppealStatement("");
    } catch {
      setAppealError("Could not file the appeal. Please try again.");
    } finally {
      setFilingAppeal(false);
    }
  };

  if (loading || taskLoading) return (
    <AppShell width="narrow">
      <div className="py-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    </AppShell>
  );

  if (!task) return (
    <AppShell width="narrow">
      <div className="py-16 text-center">
        <p className="text-outline">Task not found.</p>
        <Link href="/dashboard" className="text-primary text-sm font-semibold mt-4 inline-block hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </AppShell>
  );

  const cap = task.maxSubmissions ?? 5;
  // A submission the user forfeited in an EARLIER cycle no longer blocks a fresh attempt.
  // A forfeit in the CURRENT cycle does (the per-cycle ban).
  const activeSub = existingSub && !(existingSub.status === "withdrawn" && existingSub.cycle !== cycle) ? existingSub : null;

  // Appeals (rulebook 09).
  // Decision timestamp is reviewedAt, or the later of a subsequent admin override, whichever is more recent.
  const decidedAtOf = (sub: Submission | null | undefined) => {
    const reviewed = sub?.reviewedAt;
    const overridden = sub?.adminOverrideAt;
    if (!reviewed) return overridden ?? null;
    if (!overridden) return reviewed;
    return (overridden.seconds ?? 0) > (reviewed.seconds ?? 0) ? overridden : reviewed;
  };
  const rejectionAppealWindow = existingSub?.status === "rejected" && withinAppealWindow(decidedAtOf(existingSub));
  // Shortlisted (approved), task completed, unpaid, and the ledger says someone else's submission won.
  const winnerSelectionCandidate =
    task.status === "completed" &&
    existingSub?.status === "approved" &&
    !existingSub?.paymentProcessed &&
    !!ledgerDoc?.winnerSubmissionId &&
    ledgerDoc.winnerSubmissionId !== existingSub?.id;
  const winnerAppealWindow = winnerSelectionCandidate && withinAppealWindow(task.completedAt);
  const appealType: AppealType | null = appeal?.type ?? (rejectionAppealWindow ? "rejection" : winnerAppealWindow ? "winner_selection" : null);
  const canFileAppeal = !appeal && (rejectionAppealWindow || winnerAppealWindow);
  const showAppealSection = appealLoaded && (!!appeal || canFileAppeal);

  const activeClaims = claims.filter((c) => isClaimActive(c));
  const myClaim = activeClaims.find((c) => c.uid === user?.uid) ?? null;
  // Slots left counts live submissions + others' active reservations.
  // Your own claim doesn't count against you: it IS your held slot.
  const slotsLeft = slotsRemaining(cap, task.submissionCount ?? 0, activeClaims, user?.uid);
  const isFull = slotsLeft === 0 && !myClaim;
  const taskUnavailable = task.status === "completed" || task.status === "paused";
  const cycleCap = appUser?.role === "reviewer" || appUser?.role === "contributor" ? SUBMISSION_CYCLE_CAP[appUser.role] : null;
  const usedThisCycle = cycle != null ? (appUser?.cycleCounts?.[String(cycle)] ?? 0) : 0;
  const capLeft = cycleCap != null ? Math.max(0, cycleCap - usedThisCycle) : null;
  const cycleCapped = cycleCap != null && cycle != null && usedThisCycle >= cycleCap;
  const frozen = isFrozen(cycleConfig);
  const reviewerConflict = !!(task.reviewerId && appUser && task.reviewerId === user?.uid);
  const blocked = isFull || taskUnavailable || cycleCapped || frozen || reviewerConflict;
  const blockedReason =
    reviewerConflict ? "You are the assigned reviewer for this task, so you cannot submit to it." :
    frozen ? "Submissions for this cycle have closed. New work opens next cycle." :
    taskUnavailable ? (task.status === "completed" ? "This task is completed." : "This task is paused.") :
    isFull ? `All ${cap} submission slots are taken.` :
    cycleCapped ? "You have used all your submissions for this cycle." :
    "";

  return (
    <AppShell width="narrow">
        <Link href="/dashboard" className="text-outline text-sm hover:text-primary mb-6 inline-flex items-center gap-1 transition-colors">
          ← Back to dashboard
        </Link>

        {/* Task header */}
        <div className="card p-6 mb-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-mono text-outline">{task.id}</span>
            <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
            <span className={`badge-${task.status}`}>{task.status.replace("_", " ")}</span>
          </div>
          <h1 className="text-xl font-bold text-on-surface mb-2">{task.title}</h1>
          <p className="text-sm text-outline leading-relaxed mb-5">{task.shortDescription}</p>
          <div className="flex items-center gap-8 pt-4 border-t border-surface-container-high">
            <div>
              <p className="text-xs text-outline mb-0.5">Contributor Reward</p>
              <p className="text-2xl font-bold text-primary">
                {formatReward(task.rewardRbnt, task.reward)} <span className="text-sm font-normal text-outline">{task.paymentSplit}</span>
              </p>
            </div>

            <div>
              <p className="text-xs text-outline mb-0.5">Slots</p>
              <p className={`mono text-lg font-bold ${slotsLeft === 0 ? "text-primary" : "text-on-surface"}`}>
                {slotsLeft}<span className="text-sm font-normal text-outline"> / {cap} left</span>
              </p>
              {activeClaims.length > 0 && (
                <p className="text-[10px] text-outline">{activeClaims.length} reserved</p>
              )}
            </div>

            {/* Slot reservation (B6): hold a slot while you work, expires in a few days. */}
            {(appUser?.role === "contributor" || appUser?.role === "reviewer") && !activeSub && !taskUnavailable && !frozen && !reviewerConflict && (
              myClaim ? (
                <div className="text-xs">
                  <p className="text-ok font-semibold">Slot reserved</p>
                  <p className="text-outline">Submit before it lapses, or <button onClick={releaseClaim} className="text-primary hover:underline">release it</button>.</p>
                </div>
              ) : slotsLeft > 0 ? (
                <button onClick={claimSlot} disabled={claiming} className="btn-secondary text-xs">
                  {claiming ? "Reserving…" : `Reserve a slot (${CLAIM_DAYS}d)`}
                </button>
              ) : null
            )}
            {task.reviewerComp > 0 && (
              <div>
                <p className="text-xs text-outline mb-0.5">Reviewer Comp</p>
                <p className="text-lg font-bold text-on-surface">{formatReward(task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined, task.reviewerComp)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-on-surface mb-2 text-xs uppercase tracking-wider text-outline">Problem Statement</h2>
          <p className="text-sm text-on-surface leading-relaxed">{task.problem}</p>
        </div>

        {task.technicalRequirements && task.technicalRequirements.length > 0 && (
          <div className="card p-6 mb-4">
            <h2 className="font-bold text-xs uppercase tracking-wider text-outline mb-3">{getRequirementsLabel(task.category)}</h2>
            <ul className="space-y-2">
              {task.technicalRequirements.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-on-surface">
                  <span className="text-primary font-bold shrink-0">•</span>
                  <span className="leading-relaxed">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-xs uppercase tracking-wider text-outline mb-3">Required Deliverables</h2>
          <ol className="space-y-2">
            {task.deliverables.map((d, i) => (
              <li key={i} className="flex gap-3 text-sm text-on-surface">
                <span className="text-primary font-bold shrink-0 w-5">{i + 1}.</span>
                <span className="leading-relaxed">{d}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-xs uppercase tracking-wider text-outline mb-3">Quality Benchmarks</h2>
          <ul className="space-y-2">
            {task.qualityBenchmarks.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-on-surface">
                <span className="text-ok font-bold shrink-0">✓</span>
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6 mb-4">
          <h2 className="font-bold text-xs uppercase tracking-wider text-outline mb-3">Failure Criteria</h2>
          <ul className="space-y-2">
            {task.failureCriteria.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-on-surface">
                <span className="text-error font-bold shrink-0">✕</span>
                <span className="leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {task.infrastructure && task.infrastructure.length > 0 && (
          <div className="card p-6 mb-6">
            <h2 className="font-bold text-xs uppercase tracking-wider text-outline mb-3">Infrastructure / Resources</h2>
            <ul className="space-y-2">
              {task.infrastructure.map((r, i) => {
                const urlMatch = r.match(/(https?:\/\/\S+)/);
                if (urlMatch) {
                  const url = urlMatch[1];
                  const label = r.replace(url, "").replace(/:\s*$/, "").trim();
                  return (
                    <li key={i} className="flex gap-2 text-sm text-on-surface">
                      <span className="text-outline shrink-0">→</span>
                      <span className="leading-relaxed">
                        {label && <span>{label}: </span>}
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{url}</a>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={i} className="flex gap-2 text-sm text-on-surface">
                    <span className="text-outline shrink-0">→</span>
                    <span className="leading-relaxed">{r}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* How this is scored (B5): the exact rubric, before anyone submits. */}
        <div className="card p-6 mb-4">
          <h2 className="font-bold text-xs uppercase tracking-wider text-outline mb-1">How this is scored</h2>
          <p className="text-xs text-outline mb-3">Every submission is scored 1-5 on each of these 7 criteria (35 total). The highest-scoring submission on a completed task is the one that gets paid.</p>
          <ol className="space-y-2">
            {RUBRIC_CRITERIA.map((c, i) => (
              <li key={i} className="flex gap-3 text-sm text-on-surface">
                <span className="mono text-primary font-semibold shrink-0 w-5">{i + 1}.</span>
                <span className="leading-relaxed">{c}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Submission (contributors and reviewers; admins never submit) */}
        {appUser?.role === "admin" && (
          <div className="card p-6 text-center text-sm text-outline">Admins do not submit to tasks.</div>
        )}
        {(appUser?.role === "contributor" || appUser?.role === "reviewer") && (activeSub ? (
          <div className="card p-6 border-l-4 border-l-brand">
            <h2 className="font-bold text-on-surface mb-3">Your Submission</h2>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className={`badge-${existingSub.status}`}>{getSubmissionStatusLabel(existingSub.status, existingSub.revisionCount)}</span>
              {existingSub.status === "rejected" && existingSub.rejectedReason && (
                <span className="text-xs text-outline">{getRejectionReasonLabel(existingSub.rejectedReason)}</span>
              )}
              <span className="text-xs text-outline">
                Submitted {existingSub.createdAt?.toDate?.()?.toLocaleDateString()}
              </span>
            </div>
            {existingSub.status === "withdrawn" && (
              <div className="mb-4 rounded-lg p-3 border border-surface-container-high text-xs text-outline">
                You forfeited this submission. You can submit to this task again next cycle.
              </div>
            )}

            <div className="space-y-2 text-xs mb-4">
              {existingSub.reviewTotalScore != null && (
                <div className="flex items-center gap-2">
                  <span className="text-outline">Your score:</span>
                  <span className="mono font-bold text-primary">{existingSub.reviewTotalScore}/35</span>
                </div>
              )}
              {existingSub.reviewerWallet && (
                <div>
                  <span className="text-outline">Reviewed by: </span>
                  <span className="text-on-surface">{displayName(existingSub.reviewerName, undefined, existingSub.reviewerWallet)}</span>
                </div>
              )}
            </div>

            {/* Your own per-criterion scores after a decision (B5). */}
            {existingSub.reviewScores?.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-outline">Your rubric</p>
                {RUBRIC_CRITERIA.map((c, i) => (
                  <div key={i} className="border border-surface-container-high rounded p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold text-on-surface">{c.split(":")[0]}</p>
                      <div className="flex items-center gap-1 flex-none">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span key={s} className={`w-5 h-5 rounded mono text-[10px] font-bold flex items-center justify-center ${
                            existingSub.reviewScores[i] === s ? "bg-brand text-white" : "bg-surface-container-low text-outline"
                          }`}>{s}</span>
                        ))}
                      </div>
                    </div>
                    {existingSub.reviewJustifications?.[i] && (
                      <p className="text-xs text-outline italic">{existingSub.reviewJustifications[i]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {existingSub.reviewDecision && (
              <div className={`rounded-lg p-3 border ${
                existingSub.reviewDecision === "approved" ? "border-ok/40"
                  : existingSub.reviewDecision === "rejected" ? "border-error/40"
                  : "border-warn/40"
              }`}>
                <p className={`text-xs font-semibold mb-1 ${
                  existingSub.reviewDecision === "approved" ? "text-ok"
                    : existingSub.reviewDecision === "rejected" ? "text-error" : "text-warn"
                }`}>
                  {existingSub.reviewDecision === "approved" ? "Shortlisted"
                    : existingSub.reviewDecision === "rejected" ? "Rejected" : "Revision requested"}
                </p>
                {existingSub.requiredChanges && (
                  <p className="text-xs text-on-surface whitespace-pre-line">{existingSub.requiredChanges}</p>
                )}
                {existingSub.status === "revision_requested" && existingSub.revisionDeadline && (
                  <div className="mt-2"><RevisionCountdown deadline={existingSub.revisionDeadline} /></div>
                )}
              </div>
            )}

            {existingSub.adminOverride && (
              <div className="mt-3 rounded-lg p-3 border border-warn/40">
                <p className="text-xs font-semibold text-warn mb-1">Admin review</p>
                <p className="text-xs text-on-surface">{existingSub.adminOverrideFeedback}</p>
              </div>
            )}

            {/* Appeals (rulebook 09): a rejection or a losing winner-selection may be appealed within 7 days.
                The appeal must cite one rubric criterion. */}
            {showAppealSection && (
              <div className="mt-5 pt-5 border-t border-surface-container-high">
                {appeal ? (
                  <div className="text-xs">
                    <p className="font-semibold text-on-surface">
                      {appeal.status === "open" && `Appeal filed ${appeal.createdAt?.toDate?.()?.toLocaleDateString() ?? ""}: Open`}
                      {appeal.status === "upheld" && "Appeal upheld: decision stands"}
                      {appeal.status === "overturned" && "Appeal overturned"}
                    </p>
                    {appeal.adminNote && <p className="text-outline mt-1">{appeal.adminNote}</p>}
                  </div>
                ) : !showAppealForm ? (
                  <button onClick={() => setShowAppealForm(true)} className="btn-secondary text-xs px-3 py-1.5">
                    Appeal this decision
                  </button>
                ) : (
                  <form onSubmit={(e) => appealType && handleFileAppeal(e, appealType)} className="space-y-3">
                    <p className="text-xs font-semibold text-on-surface">Appeal this decision</p>
                    <p className="text-[11px] text-outline">
                      You have {APPEAL_WINDOW_DAYS} days from the decision to appeal. Name the rubric criterion you believe was
                      scored wrongly and explain why. Appeals go to admin; payment on this task is held while it is open.
                    </p>
                    <div>
                      <label className="label">Rubric criterion</label>
                      <select
                        className="input text-sm"
                        value={appealCriterion}
                        onChange={(e) => setAppealCriterion(Number(e.target.value))}
                      >
                        {RUBRIC_CRITERIA.map((c, i) => (
                          <option key={i} value={i}>{criterionShortLabel(i)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Statement</label>
                      <textarea
                        className="input resize-none text-sm"
                        rows={4}
                        value={appealStatement}
                        onChange={(e) => setAppealStatement(e.target.value.slice(0, APPEAL_STATEMENT_MAX))}
                        placeholder="Why do you believe this decision should be reconsidered?"
                      />
                      <p className="text-xs text-outline mt-1 text-right">{appealStatement.length}/{APPEAL_STATEMENT_MAX}</p>
                    </div>
                    {appealError && <p className="text-error text-xs">{appealError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={filingAppeal || !appealStatement.trim()} className="btn-primary text-xs px-3 py-1.5">
                        {filingAppeal ? "Filing…" : "Submit appeal"}
                      </button>
                      <button type="button" onClick={() => { setShowAppealForm(false); setAppealError(""); }} className="btn-secondary text-xs px-3 py-1.5">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {existingSub.revisionHistory && existingSub.revisionHistory.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-outline">Revision History</p>
                {existingSub.revisionHistory.map((h: any, i: number) => (
                  <div key={i} className="rounded-lg p-3 bg-surface-container-low border border-surface-container-high">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-on-surface">Round {h.round ?? i + 1}</p>
                      {h.reviewTotalScore != null && <span className="text-xs font-bold text-primary">{h.reviewTotalScore}/35</span>}
                    </div>
                    {h.requiredChanges && <p className="text-xs text-on-surface whitespace-pre-line">{h.requiredChanges}</p>}
                    {h.revisionDeadline && <p className="text-[10px] text-outline mt-1">Deadline was: {h.revisionDeadline}</p>}
                  </div>
                ))}
              </div>
            )}

            {existingSub.status === "revision_requested" && (
              <div className="mt-5 pt-5 border-t border-surface-container-high">
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
                    <p className="text-sm font-semibold text-on-surface">Update Your Submission</p>
                    <div className="bg-surface-container-low rounded-lg p-3">
                      <p className="text-xs text-primary font-semibold mb-1">Address the reviewer&apos;s feedback</p>
                      <p className="text-xs text-on-surface">Update the fields below and resubmit. Your submission will go back into the review queue.</p>
                    </div>
                    <div>
                      <label className="label">GitHub Repository Link</label>
                      <input className="input" type="url" placeholder="https://github.com/…" value={githubLink} onChange={(e) => setGithubLink(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Live URL <span className="text-outline font-normal normal-case">(deployed app, Figma, etc.)</span></label>
                      <input className="input" type="url" placeholder="https://…" value={liveLink} onChange={(e) => setLiveLink(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Published Article or Documentation Link</label>
                      <input className="input" type="url" placeholder="https://dev.to/ or https://medium.com/…" value={publishedLink} onChange={(e) => setPublishedLink(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">File Upload <span className="text-outline font-normal normal-case">(PDF, ZIP, etc., max 32MB)</span></label>
                      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.zip,.docx,.md,.mp4,.fig" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                      <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-surface-container-high hover:border-brand rounded-lg p-6 text-center cursor-pointer transition-colors">
                        {file ? (
                          <p className="text-sm text-on-surface font-semibold">{file.name}</p>
                        ) : existingSub.fileName ? (
                          <p className="text-sm text-on-surface">Current: <span className="font-semibold">{existingSub.fileName}</span> (click to replace)</p>
                        ) : (
                          <p className="text-sm text-outline">Click to upload a file</p>
                        )}
                      </div>
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div className="mt-2 bg-surface-container-low rounded-full h-1.5">
                          <div className="bg-brand h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="label">Notes for Reviewer</label>
                      <textarea className="input resize-none" rows={4}
                        placeholder="Any design decisions, known limitations, or context the reviewer should know…"
                        value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                      <p className="text-xs text-outline mt-1">{notes.length}/2000</p>
                    </div>
                    {submitError && (
                      <div className="border border-error/40 rounded-lg p-3">
                        <p className="text-error text-xs">{submitError}</p>
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

            {existingSub.status === "under_review" && !existingSub.reviewingBy && !existingSub.reviewStartedNotified && (
              <div className="mt-5 pt-5 border-t border-surface-container-high">
                <p className="text-xs font-semibold text-on-surface mb-1">Changed your mind?</p>
                <p className="text-[11px] text-outline mb-3">You can forfeit this submission while it is still waiting for a reviewer. This frees your slot, but you will not be able to submit to this task again this cycle.</p>
                <button onClick={handleWithdraw} disabled={withdrawing} className="btn-secondary text-xs px-3 py-1.5">
                  {withdrawing ? "Forfeiting…" : "Forfeit submission"}
                </button>
                {submitError && <p className="text-error text-xs mt-2">{submitError}</p>}
              </div>
            )}

            <div className="mt-5 pt-5 border-t border-surface-container-high">
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
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h2 className="font-bold text-on-surface">Submit your deliverable</h2>
              {!showForm && !blocked && (
                <button onClick={() => setShowForm(true)} className="btn-primary">Start submission</button>
              )}
            </div>

            {/* Slots + your cap, stated before you start (B5). One winner per task. */}
            {!blocked && !showForm && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="border border-surface-container-high rounded p-3 text-center">
                  <p className="mono text-lg font-semibold text-on-surface">{slotsLeft}/{cap}</p>
                  <p className="text-[10px] text-outline uppercase tracking-wide mt-0.5">Slots left</p>
                </div>
                <div className="border border-surface-container-high rounded p-3 text-center">
                  <p className="mono text-lg font-semibold text-on-surface">{capLeft ?? "-"}</p>
                  <p className="text-[10px] text-outline uppercase tracking-wide mt-0.5">Your cycle cap</p>
                </div>
                <div className="border border-surface-container-high rounded p-3 text-center">
                  <p className="mono text-lg font-semibold text-primary">1</p>
                  <p className="text-[10px] text-outline uppercase tracking-wide mt-0.5">Winner paid</p>
                </div>
              </div>
            )}

            {blocked && (
              <div className="border border-surface-container-high rounded-lg p-4 text-center">
                <p className="text-sm font-semibold text-on-surface">Submissions closed</p>
                <p className="text-xs text-outline mt-1">{blockedReason}</p>
              </div>
            )}

            {showForm && !blocked && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-surface-container-low rounded-lg p-3 mb-4">
                  <p className="text-xs text-primary font-semibold mb-1">Before you submit</p>
                  <p className="text-xs text-on-surface">
                    Make sure your submission meets every quality benchmark and avoids every failure criterion.
                    Incomplete submissions will be returned without review credit.
                  </p>
                </div>

                <div>
                  <label className="label">GitHub Repository Link</label>
                  <input className="input" type="url" placeholder="https://github.com/…" value={githubLink} onChange={(e) => setGithubLink(e.target.value)} />
                </div>
                <div>
                  <label className="label">Live URL <span className="text-outline font-normal normal-case">(deployed app, Figma, etc.)</span></label>
                  <input className="input" type="url" placeholder="https://…" value={liveLink} onChange={(e) => setLiveLink(e.target.value)} />
                </div>
                <div>
                  <label className="label">Published Article or Documentation Link</label>
                  <input className="input" type="url" placeholder="https://dev.to/ or https://medium.com/…" value={publishedLink} onChange={(e) => setPublishedLink(e.target.value)} />
                </div>

                <div>
                  <label className="label">File Upload <span className="text-outline font-normal normal-case">(PDF, ZIP, etc., max 32MB)</span></label>
                  <input ref={fileRef} type="file" className="hidden" accept=".pdf,.zip,.docx,.md,.mp4,.fig" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-surface-container-high hover:border-brand rounded-lg p-6 text-center cursor-pointer transition-colors">
                    {file ? (
                      <p className="text-sm text-on-surface font-semibold">{file.name}</p>
                    ) : (
                      <p className="text-sm text-outline">Click to upload a file</p>
                    )}
                  </div>
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mt-2 bg-surface-container-low rounded-full h-1.5">
                      <div className="bg-brand h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Notes for Reviewer</label>
                  <textarea className="input resize-none" rows={4}
                    placeholder="Any design decisions, known limitations, or context the reviewer should know…"
                    value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                  <p className="text-xs text-outline mt-1">{notes.length}/2000</p>
                </div>

                {submitError && (
                  <div className="border border-error/40 rounded-lg p-3">
                    <p className="text-error text-xs">{submitError}</p>
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
    </AppShell>
  );
}

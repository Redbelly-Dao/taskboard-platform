"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, getCategoryLabel, getRequirementsLabel, getSubmissionStatusLabel, displayName, formatReward } from "@/lib/tasks";
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

const short = (addr?: string) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "");

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
  const [viewOnly, setViewOnly] = useState(false);
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

  // Hand-off controls
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [handingOff, setHandingOff] = useState(false);

  // Filters (active queue)
  const [filterCategory, setFilterCategory] = useState<"all" | TaskCategory>("all");
  const [filterState, setFilterState] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [hideLocked, setHideLocked] = useState(false);

  const isAdmin = appUser?.role === "admin";

  // The submission ID we currently hold the "reviewing" lock on, for reliable cleanup.
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

  // Release any lock we hold when leaving the page / unmounting / navigating away,
  // so a submission never gets stuck "in review" if a reviewer closes the tab.
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

  const resetReviewForm = (sub: any) => {
    setScores(sub.reviewScores || new Array(7).fill(0));
    setJustifications(sub.reviewJustifications || new Array(7).fill(""));
    setDecision(sub.reviewDecision || "");
    setRequiredChanges(sub.requiredChanges || "");
    setRevisionDeadline(sub.revisionDeadline || "");
    setOverrideDecision("");
    setOverrideFeedback("");
    setShowHandoff(false);
    setHandoffTarget("");
    setHandoffNote("");
  };

  // Open a submission. { view } = read-only, no lock. { override } = admin override form.
  // Otherwise (an under-review submission) we claim the reviewing lock.
  const openReview = (sub: any, opts: { override?: boolean; view?: boolean } = {}) => {
    const isReviewed = sub.status !== "under_review";
    const asView = !!opts.view;

    // If we hold a lock on a different submission, release it first (switching cards).
    if (currentLockRef.current && currentLockRef.current !== sub.id) {
      const prevId = currentLockRef.current;
      updateDoc(doc(db, "submissions", prevId), { reviewingBy: null, reviewingByWallet: null }).catch(() => {});
      setSubmissions((prev) => prev.map((s) => (s.id === prevId ? { ...s, reviewingBy: null, reviewingByWallet: null } : s)));
      currentLockRef.current = null;
    }

    const willLock = !asView && !isReviewed;
    let openedSub = sub;
    if (willLock) {
      // Claim the lock and clear any pending hand-off request (we are taking it).
      const patch = {
        reviewingBy: user?.uid,
        reviewingByWallet: appUser?.walletAddress,
        reviewingByName: appUser?.username || appUser?.discordHandle || null,
        handoffRequested: false,
        handoffToWallet: null,
        handoffNote: null,
        handoffBy: null,
      };
      updateDoc(doc(db, "submissions", sub.id), patch).catch(console.error);
      openedSub = { ...sub, ...patch };
      setSubmissions((prev) => prev.map((s) => (s.id === sub.id ? openedSub : s)));
      currentLockRef.current = sub.id;
    } else {
      currentLockRef.current = null;
    }

    setViewOnly(asView);
    setSelected(openedSub);
    resetReviewForm(openedSub);
    setShowOverrideForm(!!opts.override);
  };

  // Promote a read-only view into a real (locked) review.
  const startReviewFromView = () => {
    if (selected) openReview(selected);
  };

  const closeReview = () => {
    if (selected && !viewOnly && selected.reviewingBy === user?.uid) {
      updateDoc(doc(db, "submissions", selected.id), { reviewingBy: null, reviewingByWallet: null }).catch(console.error);
      setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? { ...s, reviewingBy: null, reviewingByWallet: null } : s)));
    }
    currentLockRef.current = null;
    setMyReviewsLoaded(false);
    setSelected(null);
    setViewOnly(false);
    setShowOverrideForm(false);
    setShowHandoff(false);
  };

  // Give up a claimed review: release the lock and return it to the queue.
  const releaseLock = () => {
    if (!selected) return;
    updateDoc(doc(db, "submissions", selected.id), { reviewingBy: null, reviewingByWallet: null }).catch(() => {});
    setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? { ...s, reviewingBy: null, reviewingByWallet: null } : s)));
    currentLockRef.current = null;
    setSelected(null);
    setViewOnly(false);
    setShowHandoff(false);
  };

  // Hand a review off to another reviewer (open, or a specific typed target).
  const requestHandoff = async () => {
    if (!selected) return;
    setHandingOff(true);
    const target = handoffTarget.trim().toLowerCase() || null;
    const note = handoffNote.trim() || null;
    try {
      await updateDoc(doc(db, "submissions", selected.id), {
        handoffRequested: true,
        handoffToWallet: target,
        handoffNote: note,
        handoffBy: appUser?.walletAddress || null,
        reviewingBy: null,
        reviewingByWallet: null,
        updatedAt: serverTimestamp(),
      });
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === selected.id
            ? { ...s, handoffRequested: true, handoffToWallet: target, handoffNote: note, reviewingBy: null, reviewingByWallet: null }
            : s
        )
      );
      currentLockRef.current = null;
      setSelected(null);
      setViewOnly(false);
      setShowHandoff(false);
      setHandoffTarget("");
      setHandoffNote("");
    } catch {
      alert("Failed to request a hand-off. Please try again.");
    } finally {
      setHandingOff(false);
    }
  };

  // Cap counts only ACTIVE (non-rejected) submissions, so a rejection frees a slot.
  // Reviewers/admins can read every submission, so we recount authoritatively after
  // each decision and write it to the public task.submissionCount.
  const recountTaskActive = async (taskId: string) => {
    try {
      const snap = await getDocs(query(collection(db, "submissions"), where("taskId", "==", taskId)));
      const active = snap.docs.filter((d) => d.data().status !== "rejected").length;
      await updateDoc(doc(db, "tasks", taskId), { submissionCount: active });
    } catch {
      /* non-blocking: the count self-heals on the next decision */
    }
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
        reviewerName: appUser?.username || appUser?.discordHandle || null,
        reviewingBy: null,
        reviewingByWallet: null,
        reviewingByName: null,
        handoffRequested: false,
        handoffToWallet: null,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recountTaskActive(selected.taskId);
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
      setMyReviewsLoaded(false);
      setSelected(null);
      setViewOnly(false);
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
        adminOverrideName: appUser?.username || appUser?.discordHandle || null,
        adminOverrideFeedback: overrideFeedback,
        reviewingBy: null,
        reviewingByWallet: null,
        adminOverrideAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recountTaskActive(selected.taskId);
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
      setSelected(null);
      setViewOnly(false);
      currentLockRef.current = null;
    } catch {
      alert("Override failed. Please try again.");
    } finally {
      setOverriding(false);
    }
  };

  // ONE mutually-exclusive state pill per submission (plus an "overridden" flag).
  // A submission is either decided (approved/rejected/revision), locked by someone
  // (in review / you), waiting on a hand-off, or free (awaiting review) - never a
  // contradictory mix like "awaiting review" + "in review" at once.
  const StatusChips = ({ sub }: { sub: any }) => {
    const lockedByOther = sub.reviewingBy && sub.reviewingBy !== user?.uid;
    const lockedByMe = sub.reviewingBy && sub.reviewingBy === user?.uid;

    let chip;
    if (sub.status !== "under_review") {
      chip = <span className={`badge-${sub.status} text-[10px]`}>{getSubmissionStatusLabel(sub.status)}</span>;
    } else if (lockedByMe) {
      chip = <span className="badge bg-blue-50 text-blue-700 text-[10px]">You are reviewing</span>;
    } else if (lockedByOther) {
      const who = sub.reviewingByName || short(sub.reviewingByWallet);
      chip = (
        <span className="badge bg-amber-50 text-amber-700 text-[10px]" title={`Being reviewed by ${who || "another reviewer"}`}>
          In review{who ? ` · ${who}` : ""}
        </span>
      );
    } else if (sub.handoffRequested) {
      chip = (
        <span className="badge bg-amber-50 text-amber-800 text-[10px]" title={sub.handoffNote || "A reviewer asked for someone else to take this"}>
          Hand-off wanted{sub.handoffToWallet ? ` → ${short(sub.handoffToWallet)}` : ""}
        </span>
      );
    } else {
      chip = <span className="badge-under_review text-[10px]">Awaiting review</span>;
    }

    return (
      <div className="flex flex-wrap gap-1 justify-end">
        {chip}
        {isAdmin && sub.adminOverride && <span className="badge bg-yellow-50 text-yellow-700 text-[10px]">overridden</span>}
      </div>
    );
  };

  // Filter + regroup the active queue.
  const categoriesPresent = useMemo(() => {
    const set = new Set<TaskCategory>();
    submissions.forEach((s) => {
      const c = tasks.get(s.taskId)?.category;
      if (c) set.add(c);
    });
    return Array.from(set);
  }, [submissions, tasks]);

  const stateOptions = isAdmin
    ? [
        { value: "all", label: "All states" },
        { value: "under_review", label: "Awaiting review" },
        { value: "in_review", label: "In review (locked)" },
        { value: "handoff", label: "Hand-off requested" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
        { value: "revision_requested", label: "Revision requested" },
      ]
    : [
        { value: "all", label: "All" },
        { value: "awaiting", label: "Awaiting review" },
        { value: "in_review", label: "In review (locked)" },
        { value: "handoff", label: "Hand-off requested" },
      ];

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      const t = tasks.get(s.taskId);
      if (filterCategory !== "all" && t?.category !== filterCategory) return false;

      const lockedByOther = s.reviewingBy && s.reviewingBy !== user?.uid;
      if (hideLocked && lockedByOther) return false;

      if (filterState !== "all") {
        if (filterState === "awaiting") {
          if (!(s.status === "under_review" && !s.reviewingBy)) return false;
        } else if (filterState === "in_review") {
          if (!s.reviewingBy) return false;
        } else if (filterState === "handoff") {
          if (!s.handoffRequested) return false;
        } else if (s.status !== filterState) {
          return false;
        }
      }

      if (q && !`${s.walletAddress || ""} ${s.discordHandle || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [submissions, tasks, filterCategory, filterState, hideLocked, search, user]);

  const groupedActive = useMemo(() => {
    return Object.entries(
      filteredSubs.reduce((acc: Record<string, any[]>, sub: any) => {
        (acc[sub.taskId] ||= []).push(sub);
        return acc;
      }, {} as Record<string, any[]>)
    );
  }, [filteredSubs]);

  // Full task spec, shown at the top of the review detail so reviewers always see the bar.
  const TaskSpecCard = ({ taskId }: { taskId: string }) => {
    const t = tasks.get(taskId);
    if (!t) return null;
    return (
      <div className="card p-5 border-l-4 border-[#E63329]">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-2">Task being reviewed</p>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-mono text-xs text-[#AAAAAA]">{t.id}</span>
          <span className={`badge-${t.category} text-[10px]`}>{getCategoryLabel(t.category)}</span>
        </div>
        <div className="text-sm text-[#1A1A2E] font-bold mb-2">{t.title}</div>
        <p className="text-xs text-[#555555] mb-3 leading-relaxed">{t.problem || t.shortDescription}</p>

        {t.technicalRequirements && t.technicalRequirements.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">{getRequirementsLabel(t.category)}</div>
            <ul className="text-xs text-[#555555] space-y-1">
              {t.technicalRequirements.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="text-[#E63329] shrink-0">•</span><span>{r}</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">Required Deliverables</div>
          <ul className="text-xs text-[#555555] space-y-1">
            {t.deliverables.map((d, i) => (
              <li key={i} className="flex gap-2"><span className="text-[#E63329] font-semibold shrink-0">{i + 1}.</span><span>{d}</span></li>
            ))}
          </ul>
        </div>

        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">Quality Benchmarks</div>
          <ul className="text-xs text-[#555555] space-y-1">
            {t.qualityBenchmarks.map((b, i) => (
              <li key={i} className="flex gap-2"><span className="text-green-600 shrink-0">✓</span><span>{b}</span></li>
            ))}
          </ul>
        </div>

        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">Failure Criteria</div>
          <ul className="text-xs text-[#555555] space-y-1">
            {t.failureCriteria.map((f, i) => (
              <li key={i} className="flex gap-2"><span className="text-red-500 shrink-0">✕</span><span>{f}</span></li>
            ))}
          </ul>
        </div>

        <Link href={`/tasks/${taskId}`} className="text-[10px] text-[#E63329] hover:underline">View full task page →</Link>
      </div>
    );
  };

  // Read-only rubric (reviewer viewing a completed review, or inside admin view mode).
  const ReadOnlyRubric = ({ sub }: { sub: any }) => (
    <>
      <div className="mb-4 text-xs space-y-1">
        {sub.reviewerWallet && (
          <div><span className="text-[#AAAAAA]">Reviewed by: </span><span className="font-semibold text-[#1A1A2E]">{displayName(sub.reviewerName, undefined, sub.reviewerWallet)}</span></div>
        )}
        <div>
          <span className="text-[#AAAAAA]">Decision: </span>
          <span className={`badge-${sub.status} ml-1`}>{getSubmissionStatusLabel(sub.status)}</span>
        </div>
        {sub.reviewTotalScore != null && (
          <div><span className="text-[#AAAAAA]">Score: </span><span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span></div>
        )}
      </div>
      <div className="space-y-4">
        {RUBRIC_CRITERIA.map((criterion, i) => (
          <div key={i} className="p-4 bg-[#F4F5F7] rounded text-xs">
            <p className="font-semibold text-[#1A1A2E] mb-1">{criterion}</p>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-[#E63329] text-base">{sub.reviewScores?.[i] ?? "-"}/5</span>
              <span className="text-[#555555]">{sub.reviewJustifications?.[i] || "No justification provided."}</span>
            </div>
          </div>
        ))}
      </div>
      {sub.requiredChanges && (
        <div className="mt-4 p-3 bg-yellow-50 rounded">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Required Changes</p>
          <p className="text-xs text-yellow-700 whitespace-pre-line">{sub.requiredChanges}</p>
        </div>
      )}
      {sub.adminOverride && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Override Applied</p>
          <p className="text-xs text-yellow-700">{sub.adminOverrideFeedback}</p>
        </div>
      )}
    </>
  );

  if (loading || fetchLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
        <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const isReviewed = selected && selected.status !== "under_review";
  const holdingLock = selected && !viewOnly && !isReviewed;
  const lockedByOtherSel = selected && selected.reviewingBy && selected.reviewingBy !== user?.uid;

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {selected ? (
          <div>
            <button onClick={closeReview} className="btn-ghost mb-4 text-sm">
              {holdingLock ? "Back (releases your lock)" : "Back to submissions"}
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column: task spec first, then the submission, then chat */}
              <div className="lg:col-span-1 space-y-4">
                <TaskSpecCard taskId={selected.taskId} />

                <div className="card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-2">Submission</p>
                  <div className="mb-3"><StatusChips sub={selected} /></div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="text-[#AAAAAA] mb-0.5">Submitted by</p>
                      <p className="text-sm font-semibold text-[#1A1A2E]">{displayName(selected.username, selected.discordHandle, selected.walletAddress)}</p>
                      <p className="font-mono text-[10px] text-[#AAAAAA] break-all">{selected.walletAddress}</p>
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
                        <p className="text-sm font-semibold text-[#1A1A2E]">{displayName(selected.reviewerName, undefined, selected.reviewerWallet)}</p>
                        <p className="font-mono text-[10px] text-[#AAAAAA] break-all">{selected.reviewerWallet}</p>
                      </div>
                    )}
                    {selected.adminOverrideWallet && (
                      <div>
                        <p className="text-[#AAAAAA] mb-0.5">Admin override by</p>
                        <p className="text-sm font-semibold text-[#1A1A2E]">{displayName(selected.adminOverrideName, undefined, selected.adminOverrideWallet)}</p>
                        <p className="font-mono text-[10px] text-[#AAAAAA] break-all">{selected.adminOverrideWallet}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {selected.githubLink && (
                      <a href={selected.githubLink} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">GitHub Repository →</a>
                    )}
                    {selected.liveLink && (
                      <a href={selected.liveLink} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">Live URL →</a>
                    )}
                    {selected.publishedLink && (
                      <a href={selected.publishedLink} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">Published Article →</a>
                    )}
                    {selected.fileUrl && (
                      <a href={selected.fileUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#E63329] font-semibold hover:underline truncate">Download File: {selected.fileName} →</a>
                    )}
                  </div>

                  {selected.notes && (
                    <div className="mt-4 p-3 bg-[#F4F5F7] rounded-lg">
                      <p className="text-xs font-semibold text-[#555555] mb-1">Notes from contributor</p>
                      <p className="text-xs text-[#555555] leading-relaxed whitespace-pre-line">{selected.notes}</p>
                    </div>
                  )}
                </div>

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

              {/* Right column */}
              <div className="lg:col-span-2">
                {isReviewed ? (
                  isAdmin ? (
                    showOverrideForm ? (
                      /* Admin override form */
                      <div className="card p-6">
                        <button onClick={() => setShowOverrideForm(false)} className="text-xs text-[#E63329] mb-3 hover:underline flex items-center gap-1">← Back to review details</button>
                        <div className="mb-6 pb-6 border-b border-[#E8EBF0]">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Original Review</h3>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-[#F4F5F7] rounded-lg p-3">
                              <p className="text-xs text-[#AAAAAA] mb-1">Score</p>
                              <p className="text-xl font-bold text-[#E63329]">{selected.reviewTotalScore ?? "?"}<span className="text-sm font-normal text-[#AAAAAA]">/35</span></p>
                            </div>
                            <div className="bg-[#F4F5F7] rounded-lg p-3">
                              <p className="text-xs text-[#AAAAAA] mb-1">Decision</p>
                              <p className="text-sm font-semibold text-[#1A1A2E] capitalize">{selected.reviewDecision ?? "none"}</p>
                            </div>
                            <div className="bg-[#F4F5F7] rounded-lg p-3">
                              <p className="text-xs text-[#AAAAAA] mb-1">Status</p>
                              <span className={`badge-${selected.status}`}>{getSubmissionStatusLabel(selected.status)}</span>
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
                      /* Admin read-only view of a completed review */
                      <div className="card p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-[#1A1A2E]">Review Details</h3>
                          <button onClick={() => setShowOverrideForm(true)} className="btn-primary text-xs px-4 py-2">Override Decision</button>
                        </div>
                        <ReadOnlyRubric sub={selected} />
                        <div className="mt-4 text-xs text-[#888888]">Click "Override Decision" above if you need to change this review.</div>
                      </div>
                    )
                  ) : (
                    /* Reviewer viewing their own completed review */
                    <div className="card p-6">
                      <h3 className="font-bold text-[#1A1A2E] mb-4">Review Details (read-only)</h3>
                      <ReadOnlyRubric sub={selected} />
                    </div>
                  )
                ) : holdingLock ? (
                  /* Active review: rubric editor + hand-off controls */
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

                    <div className="mt-6 pt-6 border-t border-[#E8EBF0]">
                      <p className="label mb-3">Decision</p>
                      <div className="flex gap-3 mb-4 flex-wrap">
                        {(["approved", "revision", "rejected"] as const).map((d) => (
                          <button key={d} type="button" onClick={() => setDecision(d)}
                            className={`px-4 py-2 rounded text-sm font-semibold transition-colors capitalize ${decision === d ? (d === "approved" ? "bg-green-600 text-white" : d === "rejected" ? "bg-red-600 text-white" : "bg-yellow-500 text-white") : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#555555]"}`}>
                            {d === "revision" ? "Revision Requested" : d.charAt(0).toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>

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

                    {/* Hand-off / give-up */}
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
                  /* Read-only preview of an under-review submission (no lock claimed) */
                  <div className="card p-6">
                    <h3 className="font-bold text-[#1A1A2E] mb-2">Preview</h3>
                    <p className="text-xs text-[#888888] mb-5">
                      You are viewing this submission without claiming it. Read the task spec and the submission on the left to decide if it is yours to take.
                    </p>

                    {selected.handoffRequested && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        A hand-off was requested{selected.handoffToWallet ? ` for ${short(selected.handoffToWallet)}` : " (open to any reviewer)"}.
                        {selected.handoffNote && <span className="block mt-1 text-amber-700">"{selected.handoffNote}"</span>}
                      </div>
                    )}

                    {lockedByOtherSel && !isAdmin ? (
                      <div className="p-4 bg-[#F4F5F7] rounded-lg text-sm text-[#555555]">
                        Currently being reviewed by <span className="font-semibold">{selected.reviewingByName || short(selected.reviewingByWallet)}</span>. You can read it, but cannot start until they release it.
                      </div>
                    ) : (
                      <button onClick={startReviewFromView} className="btn-primary">
                        Start review (locks it to you and opens scoring)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Header + tabs */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">{isAdmin ? "Review and Oversight" : "Reviewer Dashboard"}</h1>
              <div className="flex gap-1 bg-white border border-[#E8EBF0] rounded-lg p-1 w-fit shadow-sm">
                <button onClick={() => setReviewTab("active")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${reviewTab === "active" ? "bg-[#E63329] text-white shadow-sm" : "text-[#888888] hover:text-[#1A1A2E]"}`}>
                  {isAdmin ? "All Submissions" : "Active Queue"}
                  {reviewTab === "active" && <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{submissions.length}</span>}
                </button>
                <button onClick={() => setReviewTab("my_reviews")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${reviewTab === "my_reviews" ? "bg-[#E63329] text-white shadow-sm" : "text-[#888888] hover:text-[#1A1A2E]"}`}>
                  My Reviews
                </button>
              </div>
            </div>

            {/* Active queue tab */}
            {reviewTab === "active" && (
              <div>
                <p className="text-[#888888] text-sm mb-4">
                  {isAdmin
                    ? "Every submission across the board. View any one, review it, or override a decision. \"In review\" means a reviewer currently has it open."
                    : "Submissions awaiting review in your domain. View one before you commit; starting a review locks it to you so two reviewers do not clash. You can give it up or hand it off any time."}
                </p>

                {/* Filter bar */}
                <div className="card p-3 mb-5 flex flex-wrap items-center gap-2">
                  <input
                    className="input text-xs w-full max-w-xs"
                    placeholder="Search by wallet or Discord handle..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select className="input text-xs w-auto" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as "all" | TaskCategory)}>
                    <option value="all">All task types</option>
                    {categoriesPresent.map((c) => (
                      <option key={c} value={c}>{getCategoryLabel(c)}</option>
                    ))}
                  </select>
                  <select className="input text-xs w-auto" value={filterState} onChange={(e) => setFilterState(e.target.value)}>
                    {stateOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-[#555555] cursor-pointer select-none ml-1">
                    <input type="checkbox" checked={hideLocked} onChange={(e) => setHideLocked(e.target.checked)} />
                    Hide locked by others
                  </label>
                  {(filterCategory !== "all" || filterState !== "all" || search || hideLocked) && (
                    <button onClick={() => { setFilterCategory("all"); setFilterState("all"); setSearch(""); setHideLocked(false); }} className="text-xs text-[#E63329] hover:underline ml-auto">
                      Clear filters
                    </button>
                  )}
                </div>

                {submissions.length === 0 ? (
                  <div className="card p-12 text-center">
                    <p className="text-[#555555] text-sm">No submissions awaiting review right now.</p>
                    <p className="text-xs text-[#AAAAAA] mt-1">Check back when contributors submit their work.</p>
                  </div>
                ) : groupedActive.length === 0 ? (
                  <div className="card p-12 text-center">
                    <p className="text-[#555555] text-sm">No submissions match these filters.</p>
                    <button onClick={() => { setFilterCategory("all"); setFilterState("all"); setSearch(""); setHideLocked(false); }} className="text-xs text-[#E63329] hover:underline mt-1">Clear filters</button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedActive.map(([taskId, subs]) => {
                      const typedSubs = subs as any[];
                      const task = tasks.get(taskId);
                      const cap = task?.maxSubmissions ?? 5;
                      const isFull = typedSubs.length >= cap;
                      const awaiting = typedSubs.filter((s) => s.status === "under_review" && !s.reviewingBy).length;
                      return (
                        <div key={taskId} className="card p-4">
                          <div className="flex items-center justify-between mb-3 gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-[#1A1A2E]">{taskId}</span>
                              {task && <span className={`badge-${task.category} text-xs`}>{getCategoryLabel(task.category)}</span>}
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isFull ? "bg-red-100 text-red-700" : "bg-[#E8EBF0] text-[#555555]"}`}>{typedSubs.length}/{cap} submissions</span>
                              {awaiting > 0 && <span className="badge bg-blue-50 text-blue-700 text-[10px]">{awaiting} awaiting review</span>}
                            </div>
                            <div className="text-xs text-[#888888] shrink-0">
                              {task ? formatReward(task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined, task.reviewerComp) : ""} reviewer comp
                            </div>
                          </div>

                          {task && (
                            <div className="mb-3 p-3 bg-[#F4F5F7] rounded text-xs text-[#555555] line-clamp-3">{task.problem || task.shortDescription}</div>
                          )}

                          <div className="flex gap-4 overflow-x-auto snap-x pb-2 -mx-1 px-1">
                            {typedSubs.map((sub: any) => {
                              const lockedByOther = sub.reviewingBy && sub.reviewingBy !== user?.uid;
                              const subIsReviewed = sub.status !== "under_review";
                              return (
                                <div key={sub.id} className={`snap-start min-w-[300px] max-w-[340px] card p-4 flex-shrink-0 transition-all ${lockedByOther && !isAdmin ? "opacity-70" : "hover:border-[#E63329] hover:shadow-md"}`}>
                                  <div className="flex justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                      <span className="text-xs font-semibold text-[#1A1A2E] truncate">{displayName(sub.username, sub.discordHandle, sub.walletAddress)}</span>
                                    </div>
                                    <StatusChips sub={sub} />
                                  </div>

                                  <div className="text-xs text-[#555555] mb-3 line-clamp-2">{sub.notes || "No notes"}</div>

                                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E8EBF0] gap-2">
                                    <div>{sub.reviewTotalScore ? <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span> : <span className="text-[#AAAAAA]">Not scored</span>}</div>
                                    <div className="flex flex-wrap gap-1.5 justify-end">
                                      <button onClick={() => openReview(sub, { view: true })} className="btn-secondary text-xs px-2.5 py-1">View</button>
                                      {isAdmin && subIsReviewed ? (
                                        <button onClick={() => openReview(sub, { override: true })} className="px-2.5 py-1 rounded text-xs font-semibold border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF] transition-colors">Override</button>
                                      ) : !subIsReviewed && !(lockedByOther && !isAdmin) ? (
                                        <button onClick={() => openReview(sub)} className="btn-primary text-xs px-3 py-1">Start review</button>
                                      ) : null}
                                    </div>
                                  </div>

                                  {(sub.githubLink || sub.liveLink) && (
                                    <div className="mt-1 flex gap-2 text-[10px]">
                                      {sub.githubLink && <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="text-[#E63329]">GitHub</a>}
                                      {sub.liveLink && <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="text-[#E63329]">Live</a>}
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
                  <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" /></div>
                ) : myReviews.length === 0 ? (
                  <div className="card p-12 text-center">
                    <p className="text-[#555555] text-sm">No completed reviews yet.</p>
                    <p className="text-xs text-[#AAAAAA] mt-1">Reviews you submit will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(
                      myReviews.reduce((acc: Record<string, any[]>, sub: any) => { (acc[sub.taskId] ||= []).push(sub); return acc; }, {} as Record<string, any[]>)
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
                                <div className="font-semibold text-[#1A1A2E] truncate">{displayName(sub.username, sub.discordHandle, sub.walletAddress)}</div>
                                <div className="mt-1 flex flex-wrap justify-between gap-1">
                                  <span className={`badge-${sub.status} text-[9px]`}>{getSubmissionStatusLabel(sub.status)}</span>
                                  {sub.reviewTotalScore && <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span>}
                                </div>
                                {isAdmin ? (
                                  <div className="flex gap-1.5 mt-2">
                                    <button onClick={() => openReview(sub, { view: true })} className="btn-primary text-xs flex-1 py-1">View Review</button>
                                    <button onClick={() => openReview(sub, { override: true })} className="px-2 py-1 rounded text-xs font-semibold border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF] flex-1">Override</button>
                                  </div>
                                ) : (
                                  <button onClick={() => openReview(sub, { view: true })} className="btn-secondary text-xs mt-2 w-full">View Review</button>
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

"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, TASK_STATUSES, getCategoryLabel, getStatusLabel, displayName, getSubmissionStatusLabel, formatReward } from "@/lib/tasks";
import { refundNotSelectedCaps } from "@/lib/submissions";
import Navbar from "@/components/Navbar";
import { StatusChips } from "@/components/reviewer/StatusChips";
import { ReviewClockBadge } from "@/components/reviewer/ReviewClockBadge";

type ReviewTab = "active" | "my_reviews";

// Admin-only: current task status as a colored tag plus a dropdown to change it right from the review page.
// That way, the admin doesn't have to switch to the Tasks tab.
// Writes tasks/{id}.status (admins are allowed to by the security rules).
function AdminTaskStatus({ task, onChange }: { task?: Task; onChange: (s: Task["status"]) => void }) {
  if (!task) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`badge-${task.status} text-xs`}>{getStatusLabel(task.status)}</span>
      <select
        value={task.status}
        onChange={(e) => onChange(e.target.value as Task["status"])}
        className="text-xs border border-surface-container-high rounded px-1.5 py-0.5 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-brand"
      >
        {TASK_STATUSES.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
      </select>
    </span>
  );
}

// Winner recommendation (announcement promise: a written recommendation within 3 days of the last decision on the task).
// Shown once every submission on an assigned task is decided and the task isn't completed yet.
// Also requires that at least one submission cleared the bar.
// Writes straight to the task doc; re-saving overwrites.
// firestore.rules lets a reviewer touch only these four keys on a task they're assigned to.
function WinnerRecommendationCard({
  task, approvedSubs, onSave,
}: {
  task: Task; approvedSubs: any[]; onSave: (subId: string, note: string) => Promise<void>;
}) {
  const already = !!task.recommendedWinnerId;
  const [editing, setEditing] = useState(!already);
  const [subId, setSubId] = useState(task.recommendedWinnerId || "");
  const [note, setNote] = useState(task.winnerRecommendationNote || "");
  const [saving, setSaving] = useState(false);

  const recommended = approvedSubs.find((s) => s.id === task.recommendedWinnerId);

  const submit = async () => {
    if (!subId || !note.trim()) return;
    setSaving(true);
    try {
      await onSave(subId, note.trim());
      setEditing(false);
    } catch {
      alert("Could not save the recommendation. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-surface-container-high">
      <p className="text-xs font-semibold text-on-surface mb-2">Winner recommendation</p>
      {!editing && recommended ? (
        <div className="text-xs bg-surface-container-low rounded-lg p-3">
          <p className="text-on-surface">
            Recommending <span className="font-semibold">{displayName(recommended.username, recommended.discordHandle, recommended.walletAddress)}</span>
            <span className="text-outline"> ({recommended.reviewTotalScore}/35)</span>
          </p>
          {task.winnerRecommendationNote && <p className="text-outline mt-1">{task.winnerRecommendationNote}</p>}
          <button onClick={() => setEditing(true)} className="text-primary hover:underline mt-2">Edit</button>
        </div>
      ) : (
        <div className="space-y-2 bg-surface-container-low rounded-lg p-3">
          <select className="input text-xs" value={subId} onChange={(e) => setSubId(e.target.value)}>
            <option value="">Choose a submission</option>
            {approvedSubs.map((s) => (
              <option key={s.id} value={s.id}>{displayName(s.username, s.discordHandle, s.walletAddress)} ({s.reviewTotalScore}/35)</option>
            ))}
          </select>
          <textarea className="input text-xs resize-none" rows={3} placeholder="Why this submission should win"
            value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving || !subId || !note.trim()} className="btn-primary text-xs px-3 py-1.5">
              {saving ? "Saving..." : already ? "Update recommendation" : "Submit recommendation"}
            </button>
            {already && <button onClick={() => setEditing(false)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewerPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();

  const [reviewTab, setReviewTab] = useState<ReviewTab>("active");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [myReviews, setMyReviews] = useState<any[]>([]);
  const [myReviewsLoading, setMyReviewsLoading] = useState(false);
  const [myReviewsLoaded, setMyReviewsLoaded] = useState(false);
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map());
  const [fetchLoading, setFetchLoading] = useState(true);

  // Filters (active queue)
  const [filterCategory, setFilterCategory] = useState<"all" | TaskCategory>("all");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterCycle, setFilterCycle] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [hideLocked, setHideLocked] = useState(false);

  const isAdmin = appUser?.role === "admin";

  const updateTaskStatus = async (taskId: string, newStatus: Task["status"]) => {
    const current = tasks.get(taskId);
    // Stamp once, the first time a task reaches Completed.
    // The winner-selection appeal window (rulebook 09) keys off this and must not reset on later status changes.
    const stampCompleted = newStatus === "completed" && !current?.completedAt;
    await updateDoc(doc(db, "tasks", taskId), {
      status: newStatus,
      ...(stampCompleted ? { completedAt: serverTimestamp() } : {}),
    });
    setTasks((prev) => {
      const next = new Map(prev);
      const t = next.get(taskId);
      if (t) next.set(taskId, { ...t, status: newStatus, ...(stampCompleted ? { completedAt: { seconds: Date.now() / 1000 } } : {}) });
      return next;
    });
    // Rulebook s03: not-selected shortlisted submissions get their cap slot back once the task is completed.
    // This control is admin-only (rendered behind isAdmin below).
    // So `submissions` here is the full unfiltered collection, not the reviewer's under_review-only view.
    if (newStatus === "completed") {
      const refundedIds = await refundNotSelectedCaps(submissions.filter((s) => s.taskId === taskId));
      if (refundedIds.length) setSubmissions((prev) => prev.map((s) => refundedIds.includes(s.id) ? { ...s, capRefunded: true } : s));
    }
  };

  // Winner recommendation: tasks this reviewer is assigned to, and every submission on them, regardless of decider.
  // myReviews below is scoped to submissions THIS reviewer personally decided.
  // That would miss one still under_review that nobody has touched yet.
  const myAssignedTaskIds = useMemo(
    () => (isAdmin ? [] : Array.from(tasks.values()).filter((t) => t.reviewerId === user?.uid).map((t) => t.id)),
    [tasks, user, isAdmin]
  );
  const [assignedSubs, setAssignedSubs] = useState<any[]>([]);
  useEffect(() => {
    if (myAssignedTaskIds.length === 0) { setAssignedSubs([]); return; }
    // Firestore "in" caps at 30 values; a reviewer's assigned-task count stays well under that in practice.
    const unsub = onSnapshot(
      query(collection(db, "submissions"), where("taskId", "in", myAssignedTaskIds.slice(0, 30))),
      (snap) => setAssignedSubs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [myAssignedTaskIds]);

  const eligibleForRecommendation = useMemo(() => {
    const map = new Map<string, any[]>();
    myAssignedTaskIds.forEach((taskId) => {
      const t = tasks.get(taskId);
      if (!t || t.status === "completed") return;
      const subs = assignedSubs.filter((s) => s.taskId === taskId);
      if (subs.length === 0) return;
      if (subs.some((s) => s.status === "under_review" || s.status === "revision_requested")) return;
      const approved = subs.filter((s) => s.status === "approved");
      if (approved.length === 0) return;
      map.set(taskId, approved);
    });
    return map;
  }, [myAssignedTaskIds, tasks, assignedSubs]);

  const saveRecommendation = async (taskId: string, subId: string, note: string) => {
    await updateDoc(doc(db, "tasks", taskId), {
      recommendedWinnerId: subId,
      winnerRecommendationNote: note,
      winnerRecommendedAt: serverTimestamp(),
      winnerRecommendedBy: user?.uid,
    });
    setTasks((prev) => {
      const next = new Map(prev);
      const t = next.get(taskId);
      if (t) next.set(taskId, { ...t, recommendedWinnerId: subId, winnerRecommendationNote: note });
      return next;
    });
  };

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role === "contributor"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  // Submissions are live (onSnapshot), not a one-time fetch.
  // A stale queue is exactly how one reviewer's finished review used to get silently overwritten by another.
  // Reviewer B's screen kept showing it as open, since it never refreshed after reviewer A claimed or decided it.
  // With a live listener, a decided submission drops out of everyone else's queue the moment it's decided.
  // (The query is scoped to status == "under_review" for non-admins.)
  // So stale locks/claims are far less likely to happen in the first place.
  // The transactional guard in the detail page is the actual guarantee; this just means reviewers rarely hit it.
  useEffect(() => {
    if (!user || !appUser) return;
    setFetchLoading(true);
    let unsubSubs: (() => void) | null = null;
    let cancelled = false;

    getDocs(collection(db, "tasks")).then((taskSnap) => {
      if (cancelled) return;
      const map = new Map<string, Task>();
      taskSnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Task));
      setTasks(map);

      const subQuery = appUser.role === "admin"
        ? collection(db, "submissions")
        : query(collection(db, "submissions"), where("status", "==", "under_review"));

      unsubSubs = onSnapshot(subQuery, (subSnap) => {
        let allSubs = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Per-task reviewer assignment (B2): a reviewer only sees submissions for tasks assigned to them.
        // Tasks with no reviewer assigned yet fall back to the category pool below, so nothing stalls mid-transition.
        if (appUser.role === "reviewer") {
          allSubs = allSubs.filter((s: any) => {
            const t = map.get(s.taskId);
            if (t?.reviewerId) return t.reviewerId === user.uid;
            return true; // unassigned task: fall through to category filtering
          });
        }
        // Enforce reviewer classes from docs (Technical/Content/Research)
        if (appUser.role === "reviewer" && appUser.reviewerCategories && appUser.reviewerCategories.length > 0) {
          allSubs = allSubs.filter((s: any) => {
            const t = map.get(s.taskId);
            return t && appUser.reviewerCategories!.includes(t.category);
          });
        }
        // Conflict of interest: a reviewer who has submitted to a task themselves never sees anyone's submissions for it.
        // Enforced for real in firestore.rules; this just keeps the queue consistent with that.
        if (appUser.role === "reviewer" && appUser.submittedTaskIds && appUser.submittedTaskIds.length > 0) {
          allSubs = allSubs.filter((s: any) => !appUser.submittedTaskIds!.includes(s.taskId));
        }
        // Forfeited submissions are out of the review flow entirely.
        allSubs = allSubs.filter((s: any) => s.status !== "withdrawn");
        setSubmissions(allSubs);
        setFetchLoading(false);
      });
    });

    return () => {
      cancelled = true;
      if (unsubSubs) unsubSubs();
    };
  }, [user, appUser]);

  // Live once the tab is opened, so a re-review or override lands without a manual refresh.
  // (This used to load exactly once per session.)
  useEffect(() => {
    if (reviewTab !== "my_reviews" || !user) return;
    if (!myReviewsLoaded) setMyReviewsLoading(true);
    const unsub = onSnapshot(query(collection(db, "submissions"), where("reviewerId", "==", user.uid)), (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.reviewedAt?.seconds ?? 0) - (a.reviewedAt?.seconds ?? 0));
      setMyReviews(sorted);
      setMyReviewsLoading(false);
      setMyReviewsLoaded(true);
    });
    return () => unsub();
  }, [reviewTab, user, myReviewsLoaded]);

  // Filter + regroup the active queue.
  const categoriesPresent = useMemo(() => {
    const set = new Set<TaskCategory>();
    submissions.forEach((s) => {
      const c = tasks.get(s.taskId)?.category;
      if (c) set.add(c);
    });
    return Array.from(set);
  }, [submissions, tasks]);

  // Cycle values present across the queue + my reviews, newest first, for the cycle filter.
  // Shared by both tabs; "All" is the default.
  const cyclesPresent = useMemo(() => {
    const set = new Set<number>();
    [...submissions, ...myReviews].forEach((s) => { if (typeof s.cycle === "number") set.add(s.cycle); });
    return Array.from(set).sort((a, b) => b - a);
  }, [submissions, myReviews]);

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
      if (filterCycle !== "all" && String(s.cycle ?? "") !== filterCycle) return false;

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
  }, [submissions, tasks, filterCategory, filterState, filterCycle, hideLocked, search, user]);

  const groupedActive = useMemo(() => {
    return Object.entries(
      filteredSubs.reduce((acc: Record<string, any[]>, sub: any) => {
        (acc[sub.taskId] ||= []).push(sub);
        return acc;
      }, {} as Record<string, any[]>)
    );
  }, [filteredSubs]);

  if (loading || fetchLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-deep">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen bg-background-deep">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header + tabs */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-on-surface mb-4">{isAdmin ? "Review and Oversight" : "Reviewer Dashboard"}</h1>
          <div className="flex gap-1 bg-surface-container border border-surface-container-high rounded-lg p-1 w-fit">
            <button onClick={() => setReviewTab("active")} className={`px-4 py-2 rounded text-sm font-semibold transition-all ${reviewTab === "active" ? "bg-brand text-white" : "text-outline hover:text-on-surface"}`}>
              {isAdmin ? "All Submissions" : "Active Queue"}
              {reviewTab === "active" && <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{submissions.length}</span>}
            </button>
            <button onClick={() => setReviewTab("my_reviews")} className={`px-4 py-2 rounded text-sm font-semibold transition-all ${reviewTab === "my_reviews" ? "bg-brand text-white" : "text-outline hover:text-on-surface"}`}>
              My Reviews
            </button>
          </div>
        </div>

        {/* Active queue tab */}
        {reviewTab === "active" && (
          <div>
            <p className="text-outline text-sm mb-4">
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
              <select className="input text-xs w-auto" value={filterCycle} onChange={(e) => setFilterCycle(e.target.value)}>
                <option value="all">All cycles</option>
                {cyclesPresent.map((c) => (
                  <option key={c} value={String(c)}>Cycle {c}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-on-surface cursor-pointer select-none ml-1">
                <input type="checkbox" checked={hideLocked} onChange={(e) => setHideLocked(e.target.checked)} />
                Hide locked by others
              </label>
              {(filterCategory !== "all" || filterState !== "all" || filterCycle !== "all" || search || hideLocked) && (
                <button onClick={() => { setFilterCategory("all"); setFilterState("all"); setFilterCycle("all"); setSearch(""); setHideLocked(false); }} className="text-xs text-primary hover:underline ml-auto">
                  Clear filters
                </button>
              )}
            </div>

            {submissions.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-on-surface text-sm">No submissions awaiting review right now.</p>
                <p className="text-xs text-outline mt-1">Check back when contributors submit their work.</p>
              </div>
            ) : groupedActive.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-on-surface text-sm">No submissions match these filters.</p>
                <button onClick={() => { setFilterCategory("all"); setFilterState("all"); setFilterCycle("all"); setSearch(""); setHideLocked(false); }} className="text-xs text-primary hover:underline mt-1">Clear filters</button>
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
                          <span className="font-mono text-sm font-bold text-on-surface">{taskId}</span>
                          {task && <span className={`badge-${task.category} text-xs`}>{getCategoryLabel(task.category)}</span>}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isFull ? "bg-error-container text-on-error-container" : "bg-surface-container-high text-on-surface"}`}>{typedSubs.length}/{cap} submissions</span>
                          {awaiting > 0 && <span className="badge bg-blue-50 text-info text-[10px]">{awaiting} awaiting review</span>}
                          {isAdmin && <AdminTaskStatus task={task} onChange={(s) => updateTaskStatus(taskId, s)} />}
                        </div>
                        <div className="text-xs text-outline shrink-0">
                          {task ? formatReward(task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined, task.reviewerComp) : ""} reviewer comp
                        </div>
                      </div>

                      {task && (
                        <div className="mb-3 p-3 bg-surface-container-low rounded text-xs text-on-surface line-clamp-3">{task.problem || task.shortDescription}</div>
                      )}

                      <div className="flex gap-4 overflow-x-auto snap-x pb-2 -mx-1 px-1">
                        {typedSubs.map((sub: any) => {
                          const lockedByOther = sub.reviewingBy && sub.reviewingBy !== user?.uid;
                          const subIsReviewed = sub.status !== "under_review";
                          return (
                            <div key={sub.id} className={`snap-start min-w-[300px] max-w-[340px] card p-4 flex-shrink-0 transition-all ${lockedByOther && !isAdmin ? "opacity-70" : "hover:border-brand hover:shadow-md"}`}>
                              <div className="flex justify-between gap-2 mb-2">
                                <div className="min-w-0 flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-on-surface truncate">{displayName(sub.username, sub.discordHandle, sub.walletAddress)}</span>
                                  {typeof sub.cycle === "number" && <span className="text-[9px] mono text-outline flex-none">c{sub.cycle}</span>}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <StatusChips sub={sub} currentUserId={user?.uid} isAdmin={isAdmin} />
                                  <ReviewClockBadge sub={sub} />
                                </div>
                              </div>

                              <div className="text-xs text-on-surface mb-3 line-clamp-2">{sub.notes || "No notes"}</div>

                              <div className="flex items-center justify-between text-xs pt-2 border-t border-surface-container-high gap-2">
                                <div>{sub.reviewTotalScore ? <span className="font-bold text-primary">{sub.reviewTotalScore}/35</span> : <span className="text-outline">Not scored</span>}</div>
                                <div className="flex flex-wrap gap-1.5 justify-end">
                                  {lockedByOther && !isAdmin ? (
                                    <span className="text-xs px-2.5 py-1 rounded bg-surface-container-low text-outline border border-surface-container-high cursor-not-allowed" title="Being reviewed by another reviewer">
                                      Locked
                                    </span>
                                  ) : (
                                    <Link href={`/reviewer/${sub.id}`} className="btn-secondary text-xs px-2.5 py-1">View</Link>
                                  )}
                                  {isAdmin && subIsReviewed ? (
                                    <Link href={`/reviewer/${sub.id}?override=1`} className="btn-outline text-xs px-2.5 py-1">Override</Link>
                                  ) : !subIsReviewed && !(lockedByOther && !isAdmin) ? (
                                    <Link href={`/reviewer/${sub.id}?start=1`} className="btn-primary text-xs px-3 py-1">Start review</Link>
                                  ) : null}
                                </div>
                              </div>

                              {(sub.githubLink || sub.liveLink) && (
                                <div className="mt-1 flex gap-2 text-[10px]">
                                  {sub.githubLink && <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="text-primary">GitHub</a>}
                                  {sub.liveLink && <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="text-primary">Live</a>}
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
            {myReviews.length > 0 && (
              <div className="card p-3 mb-4 flex items-center gap-2">
                <span className="text-xs text-outline">Cycle</span>
                <select className="input text-xs w-auto" value={filterCycle} onChange={(e) => setFilterCycle(e.target.value)}>
                  <option value="all">All cycles</option>
                  {cyclesPresent.map((c) => (
                    <option key={c} value={String(c)}>Cycle {c}</option>
                  ))}
                </select>
              </div>
            )}
            {myReviewsLoading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
            ) : myReviews.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-on-surface text-sm">No completed reviews yet.</p>
                <p className="text-xs text-outline mt-1">Reviews you submit will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  myReviews
                    .filter((s: any) => filterCycle === "all" || String(s.cycle ?? "") === filterCycle)
                    .reduce((acc: Record<string, any[]>, sub: any) => { (acc[sub.taskId] ||= []).push(sub); return acc; }, {} as Record<string, any[]>)
                ).map(([taskId, subs]) => {
                  const typedSubs = subs as any[];
                  const task = tasks.get(taskId);
                  return (
                    <div key={taskId} className="card p-4">
                      <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold">{taskId}</span>
                        {task && <span className={`badge-${task.category} text-xs`}>{getCategoryLabel(task.category)}</span>}
                        {isAdmin && <AdminTaskStatus task={task} onChange={(s) => updateTaskStatus(taskId, s)} />}
                      </div>
                      <div className="flex gap-3 overflow-x-auto snap-x">
                        {typedSubs.map((sub: any) => {
                          const lockedByOther = sub.reviewingBy && sub.reviewingBy !== user?.uid;
                          return (
                            <div key={sub.id} className="snap-start min-w-[260px] card p-3 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-on-surface truncate">{displayName(sub.username, sub.discordHandle, sub.walletAddress)}</span>
                                {typeof sub.cycle === "number" && <span className="text-[9px] mono text-outline flex-none">c{sub.cycle}</span>}
                              </div>
                              <div className="mt-1 flex flex-wrap justify-between gap-1">
                                <span className={`badge-${sub.status} text-[9px]`}>{getSubmissionStatusLabel(sub.status, sub.revisionCount)}</span>
                                {sub.reviewTotalScore && <span className="font-bold text-primary">{sub.reviewTotalScore}/35</span>}
                              </div>
                              {isAdmin ? (
                                <div className="flex gap-1.5 mt-2">
                                  <Link href={`/reviewer/${sub.id}`} className="btn-primary text-xs flex-1 py-1 text-center">View Review</Link>
                                  <Link href={`/reviewer/${sub.id}?override=1`} className="btn-outline text-xs px-2 py-1 flex-1">Override</Link>
                                </div>
                              ) : lockedByOther ? (
                                <span className="block text-center text-xs px-2 py-1 mt-2 rounded bg-surface-container-low text-outline border border-surface-container-high cursor-not-allowed" title="Being reviewed by another reviewer">
                                  Locked
                                </span>
                              ) : (
                                <Link href={`/reviewer/${sub.id}`} className="btn-secondary text-xs mt-2 w-full text-center block">View Review</Link>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {!isAdmin && task && eligibleForRecommendation.has(taskId) && (
                        <WinnerRecommendationCard
                          task={task}
                          approvedSubs={eligibleForRecommendation.get(taskId)!}
                          onSave={(subId, note) => saveRecommendation(taskId, subId, note)}
                        />
                      )}
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

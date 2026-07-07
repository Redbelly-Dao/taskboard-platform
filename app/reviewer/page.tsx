"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, getCategoryLabel, displayName, getSubmissionStatusLabel, formatReward } from "@/lib/tasks";
import Navbar from "@/components/Navbar";
import { StatusChips } from "@/components/reviewer/StatusChips";

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
  const [fetchLoading, setFetchLoading] = useState(true);

  // Filters (active queue)
  const [filterCategory, setFilterCategory] = useState<"all" | TaskCategory>("all");
  const [filterState, setFilterState] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [hideLocked, setHideLocked] = useState(false);

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role === "contributor"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  // Submissions are live (onSnapshot), not a one-time fetch. A stale queue is
  // exactly how one reviewer's finished review used to get silently overwritten
  // by another: reviewer B's screen still showed a submission as open because
  // it never refreshed after reviewer A claimed or decided it. With a live
  // listener, a decided submission drops out of everyone else's queue the
  // moment it's decided (the query is scoped to status == "under_review" for
  // non-admins), so stale locks/claims are far less likely to happen in the
  // first place. The transactional guard in the detail page is the actual
  // guarantee; this just means reviewers rarely hit it.
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
        // Enforce reviewer classes from docs (Technical/Content/Research)
        if (appUser.role === "reviewer" && appUser.reviewerCategories && appUser.reviewerCategories.length > 0) {
          allSubs = allSubs.filter((s: any) => {
            const t = map.get(s.taskId);
            return t && appUser.reviewerCategories!.includes(t.category);
          });
        }
        setSubmissions(allSubs);
        setFetchLoading(false);
      });
    });

    return () => {
      cancelled = true;
      if (unsubSubs) unsubSubs();
    };
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

  if (loading || fetchLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
        <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
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
                                <StatusChips sub={sub} currentUserId={user?.uid} isAdmin={isAdmin} />
                              </div>

                              <div className="text-xs text-[#555555] mb-3 line-clamp-2">{sub.notes || "No notes"}</div>

                              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E8EBF0] gap-2">
                                <div>{sub.reviewTotalScore ? <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span> : <span className="text-[#AAAAAA]">Not scored</span>}</div>
                                <div className="flex flex-wrap gap-1.5 justify-end">
                                  {lockedByOther && !isAdmin ? (
                                    <span className="text-xs px-2.5 py-1 rounded bg-[#F4F5F7] text-[#AAAAAA] border border-[#E8EBF0] cursor-not-allowed" title="Being reviewed by another reviewer">
                                      Locked
                                    </span>
                                  ) : (
                                    <Link href={`/reviewer/${sub.id}`} className="btn-secondary text-xs px-2.5 py-1">View</Link>
                                  )}
                                  {isAdmin && subIsReviewed ? (
                                    <Link href={`/reviewer/${sub.id}?override=1`} className="px-2.5 py-1 rounded text-xs font-semibold border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF] transition-colors">Override</Link>
                                  ) : !subIsReviewed && !(lockedByOther && !isAdmin) ? (
                                    <Link href={`/reviewer/${sub.id}?start=1`} className="btn-primary text-xs px-3 py-1">Start review</Link>
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
                        {typedSubs.map((sub: any) => {
                          const lockedByOther = sub.reviewingBy && sub.reviewingBy !== user?.uid;
                          return (
                            <div key={sub.id} className="snap-start min-w-[260px] card p-3 text-xs">
                              <div className="font-semibold text-[#1A1A2E] truncate">{displayName(sub.username, sub.discordHandle, sub.walletAddress)}</div>
                              <div className="mt-1 flex flex-wrap justify-between gap-1">
                                <span className={`badge-${sub.status} text-[9px]`}>{getSubmissionStatusLabel(sub.status)}</span>
                                {sub.reviewTotalScore && <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span>}
                              </div>
                              {isAdmin ? (
                                <div className="flex gap-1.5 mt-2">
                                  <Link href={`/reviewer/${sub.id}`} className="btn-primary text-xs flex-1 py-1 text-center">View Review</Link>
                                  <Link href={`/reviewer/${sub.id}?override=1`} className="px-2 py-1 rounded text-xs font-semibold border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF] flex-1 text-center">Override</Link>
                                </div>
                              ) : lockedByOther ? (
                                <span className="block text-center text-xs px-2 py-1 mt-2 rounded bg-[#F4F5F7] text-[#AAAAAA] border border-[#E8EBF0] cursor-not-allowed" title="Being reviewed by another reviewer">
                                  Locked
                                </span>
                              ) : (
                                <Link href={`/reviewer/${sub.id}`} className="btn-secondary text-xs mt-2 w-full text-center block">View Review</Link>
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
      </div>
    </div>
  );
}

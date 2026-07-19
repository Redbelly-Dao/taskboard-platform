"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, where, doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, getCategoryLabel, getStatusLabel, getSubmissionStatusLabel, formatReward } from "@/lib/tasks";
import { slotsRemaining } from "@/lib/claims";
import { Cycle, cyclePhase, countdownLabel } from "@/lib/cycle";
import AppShell, { PageHeader } from "@/components/AppShell";
import TaskSuggestionModal from "@/components/TaskSuggestionModal";

const RESOURCE_LINKS = [
  {
    label: "GitHub",
    description: "Source code & deliverables",
    href: "https://github.com/Redbelly-DAO-Community-Taskboard",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
    external: true,
  },
  {
    label: "Public Ledger",
    description: "Task status & payout transparency",
    href: "/ledger",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
      </svg>
    ),
    internal: true,
  },
  {
    label: "Nominate a Task",
    description: "Propose a new task for the board",
    href: "",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    ),
    action: "suggest",
  },
  {
    label: "DAO TASKBOARD",
    description: "Announcements and feedback",
    href: "https://discord.com/channels/969088176322908160/1471738127860236424",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
      </svg>
    ),
    external: true,
  },
];

type FilterCategory = "all" | TaskCategory;

const CATEGORIES: { value: FilterCategory; label: string }[] = [
  { value: "all", label: "All Tasks" },
  { value: "developer", label: "Developer" },
  { value: "documentation", label: "Documentation" },
  { value: "research", label: "Research" },
  { value: "design", label: "Design" },
  { value: "content", label: "Content" },
];

function SkeletonCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="skeleton h-3.5 w-16" />
        <div className="skeleton h-4 w-24" />
      </div>
      <div className="skeleton h-4 w-4/5 mb-2" />
      <div className="skeleton h-3 w-full mb-1" />
      <div className="skeleton h-3 w-3/4 mb-6" />
      <div className="border-t border-surface-container-high pt-3 flex items-center justify-between">
        <div className="skeleton h-6 w-16" />
        <div className="skeleton h-8 w-20" />
      </div>
    </div>
  );
}

// Stat card: big mono number with a small label under it.
function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "border-l-2 border-l-brand" : ""}`}>
      <p className="mono text-2xl font-semibold text-on-surface">{value}</p>
      <p className="text-xs text-outline mt-1">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(true);
  const [cycleCfg, setCycleCfg] = useState<Cycle | null>(null);
  const [filterCycle, setFilterCycle] = useState<string>("all");
  const [suggestOpen, setSuggestOpen] = useState(false);

  // All three feeds are live, so a new task, reviewer decision, or cycle change appears without a manual refresh.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "cycle"), (snap) => {
      setCycleCfg(snap.exists() ? ({ current: 1, ...snap.data() } as Cycle) : null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "tasks"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
      list.sort((a, b) => (a.number || 0) - (b.number || 0));
      setTasks(list);
      setTasksLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "submissions"), where("contributorId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setMySubmissions(sorted);
      setSubLoading(false);
    });
    return () => unsub();
  }, [user]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background-deep">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const cyclesPresent = Array.from(
    new Set(tasks.map((t) => t.cycle).filter((c): c is number => typeof c === "number"))
  ).sort((a, b) => b - a);
  const filteredTasks = (filter === "all" ? tasks : tasks.filter((t) => t.category === filter))
    .filter((t) => showCompleted || t.status !== "completed")
    .filter((t) => filterCycle === "all" || String(t.cycle ?? "") === filterCycle)
    .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));
  const getMySubmission = (taskId: string) => mySubmissions.find((s) => s.taskId === taskId);

  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <AppShell>
      <PageHeader
        title="Contributor Dashboard"
        subtitle="Browse open tasks, submit your work, and track your progress."
      />

      {/* Cycle countdown (B1) */}
      {cycleCfg && countdownLabel(cycleCfg) && (
        <div className={`card px-4 py-3 mb-6 flex items-center gap-3 flex-wrap ${
          cyclePhase(cycleCfg) === "frozen" ? "border-l-2 border-l-warn" : "border-l-2 border-l-brand"
        }`}>
          <span className="mono text-xs uppercase tracking-wide text-outline">Cycle {cycleCfg.current}</span>
          <span className="text-sm font-semibold text-on-surface">{countdownLabel(cycleCfg)}</span>
          <Link href="/rules" className="ml-auto text-xs text-primary font-semibold hover:underline">Rules →</Link>
        </div>
      )}

      {/* Resource links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {RESOURCE_LINKS.map((link) => {
          const inner = (
            <div className="card p-3.5 h-full flex items-start gap-3 transition-colors group hover:border-brand cursor-pointer">
              <div className="mt-0.5 flex-shrink-0 text-primary">
                {link.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight flex items-center gap-1 text-on-surface group-hover:text-primary transition-colors">
                  {link.label}
                  <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </p>
                <p className="text-[10px] text-outline mt-0.5 leading-tight">{link.description}</p>
              </div>
            </div>
          );
          return (link as any).action === "suggest" ? (
            <button key={link.label} type="button" onClick={() => setSuggestOpen(true)} className="text-left">{inner}</button>
          ) : (link as any).internal && link.href ? (
            <Link key={link.label} href={link.href}>{inner}</Link>
          ) : link.href ? (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{inner}</a>
          ) : (
            <div key={link.label}>{inner}</div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat accent value={tasksLoading ? "-" : openCount} label="Open tasks" />
        <Link href="/submissions" className="card p-4 hover:border-brand transition-colors group">
          <p className="mono text-2xl font-semibold text-on-surface">{subLoading ? "-" : mySubmissions.length}</p>
          <p className="text-xs text-outline mt-1 group-hover:text-primary transition-colors">My submissions →</p>
        </Link>
        <Stat value={subLoading ? "-" : mySubmissions.filter((s) => s.status === "under_review").length} label="Under review" />
        <Stat value={subLoading ? "-" : mySubmissions.filter((s) => s.status === "approved").length} label="Shortlisted" />
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilter(cat.value)}
            className={`px-3.5 py-1.5 rounded text-xs font-semibold transition-colors ${
              filter === cat.value
                ? "bg-brand text-white"
                : "text-on-surface border border-outline-variant hover:border-brand hover:text-primary"
            }`}
          >
            {cat.label}
          </button>
        ))}
        {completedCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-outline cursor-pointer select-none ml-1">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="accent-brand" />
            Show completed ({completedCount})
          </label>
        )}
        {cyclesPresent.length > 0 && (
          <select className="input text-xs w-auto ml-auto" value={filterCycle} onChange={(e) => setFilterCycle(e.target.value)}>
            <option value="all">All cycles</option>
            {cyclesPresent.map((c) => <option key={c} value={String(c)}>Cycle {c}</option>)}
          </select>
        )}
      </div>

      {/* Task grid */}
      {tasksLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-outline text-sm">
            {tasks.length === 0
              ? "No tasks are open yet. The next cycle opens soon."
              : "No tasks in this category."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => {
            const mySub = getMySubmission(task.id);
            const cap = task.maxSubmissions ?? 5;
            // Same helper the task page uses (browse view has no claim data here, so this reflects submitted slots).
            const slotsLeft = slotsRemaining(cap, task.submissionCount ?? 0, [], user?.uid);
            const isCompleted = task.status === "completed";
            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className={`card p-5 flex flex-col transition-colors hover:border-brand ${isCompleted ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                    <span className="mono text-xs text-outline">{task.id}</span>
                    <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
                    {typeof task.cycle === "number" && <span className="mono text-[10px] text-outline">c{task.cycle}</span>}
                  </div>
                  <span className={`badge-${mySub ? mySub.status : task.status} flex-shrink-0`}>
                    {mySub ? getSubmissionStatusLabel(mySub.status, mySub.revisionCount) : getStatusLabel(task.status)}
                  </span>
                </div>

                <h3 className="font-semibold text-on-surface text-sm mb-2 leading-snug">{task.title}</h3>
                <p className="text-xs text-outline leading-relaxed flex-1">{task.shortDescription}</p>

                {/* Slots remaining, stated before anyone starts work. */}
                {!isCompleted && (
                  <p className="mono text-[10px] mt-3 text-outline">
                    {slotsLeft === 0
                      ? <span className="text-error">NO SLOTS LEFT</span>
                      : <>{slotsLeft} OF {cap} SLOTS LEFT</>}
                  </p>
                )}

                <div className="flex items-end justify-between gap-3 pt-3 mt-3 border-t border-surface-container-high">
                  <div className="min-w-0">
                    <p className="mono text-base font-semibold text-primary truncate">
                      {formatReward(task.rewardRbnt, task.reward)}
                    </p>
                    <p className="mono text-[10px] text-outline mt-0.5">{task.paymentSplit}</p>
                  </div>
                  <span className="btn-primary text-xs px-3.5 py-1.5 flex-shrink-0">
                    {mySub ? "View submission" : "View task"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {suggestOpen && <TaskSuggestionModal onClose={() => setSuggestOpen(false)} />}
    </AppShell>
  );
}

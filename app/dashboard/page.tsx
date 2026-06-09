"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, getCategoryLabel, getStatusLabel, formatReward } from "@/lib/tasks";
import Navbar from "@/components/Navbar";

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
    href: "https://docs.google.com/spreadsheets/d/1B4F_pk9EPq_8Lcbm9v1tVunSUPSckLeQnjBPfU-84Go/edit?usp=sharing",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
      </svg>
    ),
    external: true,
  },
  {
    label: "Nominate a Task",
    description: "Propose a new task for the board",
    href: "", // TODO: add Google Form link when live
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    ),
    external: true,
    comingSoon: true,
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
        <div className="skeleton h-5 w-24 rounded-full" />
      </div>
      <div className="skeleton h-4 w-4/5 mb-2" />
      <div className="skeleton h-3 w-full mb-1" />
      <div className="skeleton h-3 w-3/4 mb-6" />
      <div className="border-t border-[#E8EBF0] pt-3 flex items-center justify-between">
        <div className="skeleton h-6 w-16" />
        <div className="skeleton h-8 w-20 rounded" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [tasksLoading, setTasksLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    getDocs(collection(db, "tasks")).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
      list.sort((a, b) => (a.number || 0) - (b.number || 0));
      setTasks(list);
      setTasksLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "submissions"), where("contributorId", "==", user.uid));
    getDocs(q).then((snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setMySubmissions(sorted);
      setSubLoading(false);
    });
  }, [user]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
      <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const filteredTasks = filter === "all" ? tasks : tasks.filter((t) => t.category === filter);
  const getMySubmission = (taskId: string) => mySubmissions.find((s) => s.taskId === taskId);

  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Contributor Dashboard</h1>
          <p className="text-[#888888] text-sm mt-1">
            Browse open tasks, submit your work, and track your progress.
          </p>
        </div>

        {/* Resource links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {RESOURCE_LINKS.map((link) => {
            const inner = (
              <div className={`card p-3.5 flex items-start gap-3 transition-all group ${
                link.comingSoon
                  ? "opacity-60 cursor-default"
                  : "hover:border-[#E63329] hover:shadow-sm cursor-pointer"
              }`}>
                <div className={`mt-0.5 flex-shrink-0 ${link.comingSoon ? "text-[#AAAAAA]" : "text-[#E63329]"}`}>
                  {link.icon}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold leading-tight flex items-center gap-1 ${link.comingSoon ? "text-[#AAAAAA]" : "text-[#1A1A2E] group-hover:text-[#E63329]"}`}>
                    {link.label}
                    {link.comingSoon ? (
                      <span className="text-[9px] font-medium bg-[#F4F5F7] text-[#AAAAAA] px-1.5 py-0.5 rounded-full">Soon</span>
                    ) : (
                      <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    )}
                  </p>
                  <p className="text-[10px] text-[#AAAAAA] mt-0.5 leading-tight">{link.description}</p>
                </div>
              </div>
            );
            return link.href && !link.comingSoon ? (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{inner}</a>
            ) : (
              <div key={link.label}>{inner}</div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="card p-4 border-l-4 border-l-[#E63329]">
            <p className="text-2xl font-bold text-[#1A1A2E]">{tasksLoading ? "..." : openCount}</p>
            <p className="text-xs text-[#888888] mt-0.5">Open Tasks</p>
          </div>
          <Link href="/submissions" className="card p-4 hover:border-[#E63329] transition-colors group">
            <p className="text-2xl font-bold text-[#1A1A2E]">{subLoading ? "..." : mySubmissions.length}</p>
            <p className="text-xs text-[#888888] mt-0.5 group-hover:text-[#E63329] transition-colors">My Submissions →</p>
          </Link>
          <div className="card p-4">
            <p className="text-2xl font-bold text-[#1A1A2E]">{subLoading ? "..." : mySubmissions.filter((s) => s.status === "under_review").length}</p>
            <p className="text-xs text-[#888888] mt-0.5">Under Review</p>
          </div>
          <div className="card p-4">
            <p className="text-2xl font-bold text-[#1A1A2E]">{subLoading ? "..." : mySubmissions.filter((s) => s.status === "approved").length}</p>
            <p className="text-xs text-[#888888] mt-0.5">Approved</p>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === cat.value
                  ? "bg-[#E63329] text-white shadow-sm"
                  : "bg-white text-[#555555] border border-[#E8EBF0] hover:border-[#E63329] hover:text-[#E63329]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Task grid */}
        {tasksLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-[#888888] text-sm">
              {tasks.length === 0
                ? "No tasks available yet. Check back soon."
                : "No tasks in this category."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((task) => {
              const mySub = getMySubmission(task.id);
              return (
                <div key={task.id} className="card p-5 flex flex-col hover:border-[#E63329] hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-[#AAAAAA]">{task.id}</span>
                      <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
                    </div>
                    <span className={`badge-${mySub ? mySub.status : task.status} flex-shrink-0`}>
                      {mySub ? getStatusLabel(mySub.status) : getStatusLabel(task.status)}
                    </span>
                  </div>

                  <h3 className="font-bold text-[#1A1A2E] text-sm mb-2 leading-tight">{task.title}</h3>
                  <p className="text-xs text-[#888888] leading-relaxed flex-1 mb-4">{task.shortDescription}</p>

                  <div className="flex items-center justify-between pt-3 border-t border-[#E8EBF0]">
                    <div>
                      <p className="text-lg font-bold text-[#E63329]">{formatReward(task.rewardRbnt, task.reward)}</p>
                      <p className="text-[10px] text-[#AAAAAA]">{task.paymentSplit}</p>
                    </div>
                    <Link href={`/tasks/${task.id}`} className="btn-primary text-xs px-4 py-2">
                      {mySub ? "View Submission" : "View Task"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

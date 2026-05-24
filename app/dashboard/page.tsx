"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, getCategoryLabel, getStatusLabel } from "@/lib/tasks";
import Navbar from "@/components/Navbar";

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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Contributor Dashboard</h1>
          <p className="text-[#888888] text-sm mt-1">
            Browse open tasks, submit your work, and track your progress.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Open Tasks", value: tasksLoading ? "—" : openCount, accent: true },
            { label: "My Submissions", value: subLoading ? "—" : mySubmissions.length, accent: false },
            { label: "Under Review", value: subLoading ? "—" : mySubmissions.filter((s) => s.status === "under_review").length, accent: false },
            { label: "Approved", value: subLoading ? "—" : mySubmissions.filter((s) => s.status === "approved").length, accent: false },
          ].map((stat) => (
            <div key={stat.label} className={`card p-4 ${stat.accent ? "border-l-4 border-l-[#E63329]" : ""}`}>
              <p className="text-2xl font-bold text-[#1A1A2E]">{stat.value}</p>
              <p className="text-xs text-[#888888] mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* My submissions */}
        {!subLoading && mySubmissions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-base font-bold text-[#1A1A2E] mb-3">My Submissions</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-white" style={{ backgroundColor: "#2C2C2C" }}>
                    <th className="text-left px-4 py-3 font-semibold">Task</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mySubmissions.map((sub, i) => (
                    <tr key={sub.id} className={i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#1A1A2E] text-xs font-mono">{sub.taskId}</p>
                        <p className="text-xs text-[#888888] truncate max-w-[220px]">{sub.taskTitle}</p>
                      </td>
                      <td className="px-4 py-3 text-[#888888] text-xs">
                        {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge-${sub.status}`}>{getStatusLabel(sub.status)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/tasks/${sub.taskId}`} className="text-[#E63329] text-xs font-semibold hover:underline">
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                      <p className="text-lg font-bold text-[#E63329]">${task.reward}</p>
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

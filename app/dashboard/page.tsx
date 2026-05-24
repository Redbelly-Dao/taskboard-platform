"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { TASKS, getCategoryLabel, getStatusLabel } from "@/lib/tasks";
import Navbar from "@/components/Navbar";

type FilterCategory = "all" | "developer" | "design" | "research" | "documentation" | "content";

export default function DashboardPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const fetchSubs = async () => {
      const q = query(
        collection(db, "submissions"),
        where("contributorId", "==", user.uid)
      );
      const snap = await getDocs(q);
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setMySubmissions(sorted);
      setSubLoading(false);
    };
    fetchSubs();
  }, [user]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const filteredTasks = filter === "all" ? TASKS : TASKS.filter((t) => t.category === filter);

  const getMySubmission = (taskId: string) =>
    mySubmissions.find((s) => s.taskId === taskId);

  const categories: { value: FilterCategory; label: string }[] = [
    { value: "all", label: "All Tasks" },
    { value: "developer", label: "Developer" },
    { value: "documentation", label: "Documentation" },
    { value: "research", label: "Research" },
    { value: "design", label: "Design" },
    { value: "content", label: "Content" },
  ];

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Contributor Dashboard</h1>
          <p className="text-[#555555] text-sm mt-1">
            Browse open tasks, submit your work, and track your submissions.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Open Tasks", value: TASKS.filter((t) => t.status === "open").length, accent: true },
            { label: "My Submissions", value: mySubmissions.length, accent: false },
            { label: "Under Review", value: mySubmissions.filter((s) => s.status === "under_review").length, accent: false },
            { label: "Approved", value: mySubmissions.filter((s) => s.status === "approved").length, accent: false },
          ].map((stat) => (
            <div key={stat.label} className={`card p-4 ${stat.accent ? "border-l-4 border-l-[#E63329]" : ""}`}>
              <p className="text-2xl font-bold text-[#1A1A2E]">{stat.value}</p>
              <p className="text-xs text-[#555555] mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* My active submissions */}
        {mySubmissions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-base font-bold text-[#1A1A2E] mb-3">My Submissions</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1A2B4A] text-white text-xs">
                    <th className="text-left px-4 py-3 font-semibold">Task</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mySubmissions.map((sub, i) => {
                    const task = TASKS.find((t) => t.id === sub.taskId);
                    return (
                      <tr key={sub.id} className={i % 2 === 1 ? "bg-[#F0F2F5]" : "bg-white"}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#1A1A2E]">{task?.id}</p>
                          <p className="text-xs text-[#555555] truncate max-w-[200px]">{task?.title}</p>
                        </td>
                        <td className="px-4 py-3 text-[#555555] text-xs">
                          {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge-${sub.status}`}>{getStatusLabel(sub.status)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/tasks/${sub.taskId}`} className="text-[#E63329] text-xs font-semibold hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Category filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                filter === cat.value
                  ? "bg-[#E63329] text-white"
                  : "bg-white text-[#555555] border border-[#E5E5E5] hover:border-[#E63329] hover:text-[#E63329]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Task grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => {
            const mySub = getMySubmission(task.id);
            return (
              <div key={task.id} className="card p-5 flex flex-col hover:border-[#E63329] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#AAAAAA]">{task.id}</span>
                    <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
                  </div>
                  <span className={`badge-${mySub ? mySub.status : task.status}`}>
                    {mySub ? getStatusLabel(mySub.status) : getStatusLabel(task.status)}
                  </span>
                </div>

                <h3 className="font-bold text-[#1A1A2E] text-sm mb-2 leading-tight">{task.title}</h3>
                <p className="text-xs text-[#555555] leading-relaxed flex-1 mb-4">{task.shortDescription}</p>

                <div className="flex items-center justify-between pt-3 border-t border-[#E8EBF0]">
                  <div>
                    <p className="text-lg font-bold text-[#E63329]">${task.reward}</p>
                    <p className="text-xs text-[#AAAAAA]">{task.paymentSplit}</p>
                  </div>
                  <Link href={`/tasks/${task.id}`} className="btn-primary text-xs px-4 py-2">
                    {mySub ? "View Submission" : "View Task"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

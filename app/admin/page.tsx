"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, doc, updateDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { TASKS, getCategoryLabel, getStatusLabel } from "@/lib/tasks";
import Navbar from "@/components/Navbar";

type AdminTab = "submissions" | "users" | "payments";

export default function AdminPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>("submissions");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role !== "admin"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  useEffect(() => {
    if (!user || appUser?.role !== "admin") return;
    const fetchAll = async () => {
      const [subsSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, "submissions"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "users")),
      ]);
      setSubmissions(subsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDataLoading(false);
    };
    fetchAll();
  }, [user, appUser]);

  const updateRole = async (userId: string, newRole: string) => {
    await updateDoc(doc(db, "users", userId), { role: newRole });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
  };

  const approvedSubmissions = submissions.filter((s) => s.status === "approved" && !s.paymentProcessed);
  const exportPaymentBatch = () => {
    const rows = [
      ["Task ID", "Task Title", "Contributor Wallet", "Contributor RBNT ($)", "Reviewer Wallet", "Reviewer RBNT ($)", "Payment Split"],
      ...approvedSubmissions.map((s) => {
        const task = TASKS.find((t) => t.id === s.taskId);
        return [
          s.taskId,
          s.taskTitle,
          s.walletAddress,
          task?.reward || "",
          s.reviewerWallet || "",
          task?.reviewerComp || "",
          task?.paymentSplit || "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (loading || dataLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const stats = [
    { label: "Total Submissions", value: submissions.length },
    { label: "Under Review", value: submissions.filter((s) => s.status === "under_review").length },
    { label: "Approved", value: submissions.filter((s) => s.status === "approved").length },
    { label: "Pending Payment", value: approvedSubmissions.length },
    { label: "Total Users", value: users.length },
    { label: "Reviewers", value: users.filter((u) => u.role === "reviewer").length },
  ];

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Admin Dashboard</h1>
          <p className="text-[#555555] text-sm mt-1">Full task board management and oversight.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <p className="text-xl font-bold text-[#1A1A2E]">{s.value}</p>
              <p className="text-xs text-[#555555] mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-[#E5E5E5] rounded p-1 w-fit">
          {(["submissions", "users", "payments"] as AdminTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm font-semibold transition-colors capitalize ${
                tab === t ? "bg-[#E63329] text-white" : "text-[#555555] hover:text-[#1A1A2E]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* SUBMISSIONS TAB */}
        {tab === "submissions" && (
          <div className="card overflow-hidden">
            <div className="bg-[#1A2B4A] px-4 py-3">
              <p className="text-white font-semibold text-sm">All Submissions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F0F2F5] text-xs text-[#555555]">
                    <th className="text-left px-4 py-3 font-semibold">Task</th>
                    <th className="text-left px-4 py-3 font-semibold">Contributor</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Score</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub, i) => (
                    <tr key={sub.id} className={i % 2 === 1 ? "bg-[#F0F2F5]" : "bg-white"}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-xs text-[#1A1A2E]">{sub.taskId}</p>
                        <p className="text-xs text-[#AAAAAA] truncate max-w-[140px]">{sub.taskTitle}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-[#1A1A2E]">{sub.walletAddress?.slice(0,6)}...{sub.walletAddress?.slice(-4)}</p>
                        {sub.discordHandle && <p className="text-xs text-[#AAAAAA]">{sub.discordHandle}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge-${sub.status}`}>{sub.status?.replace("_", " ")}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {sub.reviewTotalScore ? (
                          <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#555555]">
                        {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {sub.githubLink && (
                            <a href={sub.githubLink} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#E63329] font-semibold hover:underline">
                              GitHub
                            </a>
                          )}
                          {sub.liveLink && (
                            <a href={sub.liveLink} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#E63329] font-semibold hover:underline">
                              Live
                            </a>
                          )}
                          {sub.fileUrl && (
                            <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#E63329] font-semibold hover:underline">
                              File
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#AAAAAA]">
                        No submissions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="card overflow-hidden">
            <div className="bg-[#1A2B4A] px-4 py-3 flex items-center justify-between">
              <p className="text-white font-semibold text-sm">All Users</p>
              <p className="text-[#AAAAAA] text-xs">Set reviewer or admin roles here</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F0F2F5] text-xs text-[#555555]">
                    <th className="text-left px-4 py-3 font-semibold">Wallet Address</th>
                    <th className="text-left px-4 py-3 font-semibold">Discord</th>
                    <th className="text-left px-4 py-3 font-semibold">Current Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Joined</th>
                    <th className="text-left px-4 py-3 font-semibold">Change Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className={i % 2 === 1 ? "bg-[#F0F2F5]" : "bg-white"}>
                      <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">{u.walletAddress}</td>
                      <td className="px-4 py-3 text-xs text-[#555555]">{u.discordHandle || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${
                          u.role === "admin" ? "bg-[#FEF0EF] text-[#E63329]" :
                          u.role === "reviewer" ? "bg-blue-50 text-blue-700" :
                          "bg-[#F0F2F5] text-[#555555]"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#555555]">
                        {u.createdAt?.toDate?.()?.toLocaleDateString() ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value)}
                          className="text-xs border border-[#E5E5E5] rounded px-2 py-1 bg-white text-[#1A1A2E] focus:outline-none focus:border-[#E63329]"
                        >
                          <option value="contributor">Contributor</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {tab === "payments" && (
          <div>
            <div className="bg-[#FEF0EF] border border-[#E63329] border-opacity-30 rounded p-4 mb-6">
              <p className="text-sm font-semibold text-[#E63329] mb-1">Payment Process</p>
              <p className="text-xs text-[#555555]">
                Admins compile approved payment details and relay them to the High Council for multi-sig disbursement.
                Admins do not directly hold or transfer funds. RBNT is paid at market price on the day of disbursement.
              </p>
            </div>

            <div className="card overflow-hidden mb-4">
              <div className="bg-[#1A2B4A] px-4 py-3 flex items-center justify-between">
                <p className="text-white font-semibold text-sm">Approved — Pending Payment ({approvedSubmissions.length})</p>
                {approvedSubmissions.length > 0 && (
                  <button onClick={exportPaymentBatch} className="btn-primary text-xs px-3 py-1.5">
                    Export CSV for HC
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F0F2F5] text-xs text-[#555555]">
                      <th className="text-left px-4 py-3 font-semibold">Task</th>
                      <th className="text-left px-4 py-3 font-semibold">Contributor Wallet</th>
                      <th className="text-left px-4 py-3 font-semibold">Contributor Pay</th>
                      <th className="text-left px-4 py-3 font-semibold">Reviewer Wallet</th>
                      <th className="text-left px-4 py-3 font-semibold">Reviewer Pay</th>
                      <th className="text-left px-4 py-3 font-semibold">Split</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedSubmissions.map((sub, i) => {
                      const task = TASKS.find((t) => t.id === sub.taskId);
                      return (
                        <tr key={sub.id} className={i % 2 === 1 ? "bg-[#F0F2F5]" : "bg-white"}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-xs text-[#1A1A2E]">{sub.taskId}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">{sub.walletAddress}</td>
                          <td className="px-4 py-3 font-bold text-xs text-[#E63329]">${task?.reward}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[#555555]">{sub.reviewerWallet || "—"}</td>
                          <td className="px-4 py-3 text-xs text-[#555555]">{task?.reviewerComp ? `$${task.reviewerComp}` : "N/A"}</td>
                          <td className="px-4 py-3 text-xs text-[#555555]">{task?.paymentSplit}</td>
                        </tr>
                      );
                    })}
                    {approvedSubmissions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#AAAAAA]">
                          No approved submissions pending payment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {approvedSubmissions.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[#555555] mb-2 uppercase tracking-wide">Batch Summary</p>
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-[#AAAAAA]">Total Contributor Pay</p>
                    <p className="text-lg font-bold text-[#E63329]">
                      ${approvedSubmissions.reduce((sum, s) => {
                        const task = TASKS.find((t) => t.id === s.taskId);
                        return sum + (task?.reward || 0);
                      }, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#AAAAAA]">Total Reviewer Pay</p>
                    <p className="text-lg font-bold text-[#1A1A2E]">
                      ${approvedSubmissions.reduce((sum, s) => {
                        const task = TASKS.find((t) => t.id === s.taskId);
                        return sum + (task?.reviewerComp || 0);
                      }, 0)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

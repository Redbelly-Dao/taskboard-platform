"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection, getDocs, doc, updateDoc, setDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, getCategoryLabel, getStatusLabel, formatReward } from "@/lib/tasks";
import Navbar from "@/components/Navbar";
import SubmissionChat from "@/components/SubmissionChat";

type AdminTab = "submissions" | "tasks" | "users" | "payments";

const TASK_STATUSES: Task["status"][] = ["open", "assigned", "in_progress", "under_review", "completed", "paused"];
const TASK_CATEGORIES: TaskCategory[] = ["developer", "design", "research", "documentation", "content"];

function ListEditor({
  label, items, setItems, placeholder,
}: {
  label: string; items: string[]; setItems: (v: string[]) => void; placeholder: string;
}) {
  const update = (i: number, val: string) => { const n = [...items]; n[i] = val; setItems(n); };
  const remove = (i: number) => setItems(items.filter((_, j) => j !== i));
  const add = () => setItems([...items, ""]);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input className="input text-sm flex-1" placeholder={`${placeholder} ${i + 1}`} value={item} onChange={(e) => update(i, e.target.value)} />
            {items.length > 1 && (
              <button type="button" onClick={() => remove(i)} className="text-[#AAAAAA] hover:text-red-500 px-2 text-lg transition-colors">×</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-2 text-xs text-[#E63329] font-semibold hover:underline">
        + Add item
      </button>
    </div>
  );
}

export default function AdminPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<AdminTab>("submissions");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Audit panel
  const [auditSub, setAuditSub] = useState<any>(null);

  // Override modal
  const [overrideSub, setOverrideSub] = useState<any>(null);
  const [overrideDecision, setOverrideDecision] = useState<"approved" | "rejected" | "">("");
  const [overrideFeedback, setOverrideFeedback] = useState("");
  const [overriding, setOverriding] = useState(false);

  // RBNT price oracle
  const [rbntPrice, setRbntPrice] = useState<number | null>(null);
  const [rbntPriceLoading, setRbntPriceLoading] = useState(false);
  const [rbntPriceError, setRbntPriceError] = useState("");

  const fetchRbntPrice = async () => {
    setRbntPriceLoading(true);
    setRbntPriceError("");
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=redbelly-network-token&vs_currencies=usd"
      );
      const data = await res.json();
      const price = data?.["redbelly-network-token"]?.usd;
      if (!price) throw new Error("Price not found");
      setRbntPrice(price);
    } catch {
      setRbntPriceError("Could not fetch price. Try again or enter manually.");
    } finally {
      setRbntPriceLoading(false);
    }
  };

  const toRbnt = (usd: string) => {
    const n = parseFloat(usd);
    if (!rbntPrice || !n || isNaN(n)) return null;
    return Math.round(n / rbntPrice).toLocaleString();
  };

  // Task form state
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskFormMode, setTaskFormMode] = useState<"add" | "edit">("add");
  const [formTaskId, setFormTaskId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<TaskCategory>("developer");
  const [formReward, setFormReward] = useState("");
  const [formRewardRbnt, setFormRewardRbnt] = useState("");
  const [formPaymentSplit, setFormPaymentSplit] = useState("100% RBNT");
  const [formStatus, setFormStatus] = useState<Task["status"]>("open");
  const [formShortDesc, setFormShortDesc] = useState("");
  const [formProblem, setFormProblem] = useState("");
  const [formDeliverables, setFormDeliverables] = useState<string[]>([""]);
  const [formBenchmarks, setFormBenchmarks] = useState<string[]>([""]);
  const [formFailure, setFormFailure] = useState<string[]>([""]);
  const [formTechnicalReqs, setFormTechnicalReqs] = useState<string[]>([""]);
  const [formInfrastructure, setFormInfrastructure] = useState<string[]>([""]);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role !== "admin"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  useEffect(() => {
    if (!user || appUser?.role !== "admin") return;
    const fetchAll = async () => {
      const [subsSnap, usersSnap, tasksSnap] = await Promise.all([
        getDocs(query(collection(db, "submissions"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "tasks")),
      ]);
      setSubmissions(subsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const taskList = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
      taskList.sort((a, b) => (a.number || 0) - (b.number || 0));
      setTasks(taskList);
      setDataLoading(false);
    };
    fetchAll();
  }, [user, appUser]);

  const updateRole = async (userId: string, newRole: string) => {
    await updateDoc(doc(db, "users", userId), { role: newRole });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
  };

  const suspendUser = async (userId: string, suspend: boolean) => {
    await updateDoc(doc(db, "users", userId), { suspended: suspend });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, suspended: suspend } : u));
  };

  const applyAdminOverride = async () => {
    if (!overrideSub || !overrideDecision || !overrideFeedback.trim()) return;
    setOverriding(true);
    try {
      await updateDoc(doc(db, "submissions", overrideSub.id), {
        status: overrideDecision === "approved" ? "approved" : "rejected",
        reviewDecision: overrideDecision,
        adminOverride: true,
        adminOverrideBy: user?.uid,
        adminOverrideWallet: appUser?.walletAddress,
        adminOverrideFeedback: overrideFeedback,
        adminOverrideAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubmissions((prev) => prev.map((s) =>
        s.id === overrideSub.id
          ? { ...s, status: overrideDecision === "approved" ? "approved" : "rejected", reviewDecision: overrideDecision, adminOverride: true }
          : s
      ));
      setOverrideSub(null);
      setOverrideDecision("");
      setOverrideFeedback("");
    } catch {
      alert("Override failed. Please try again.");
    } finally {
      setOverriding(false);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: Task["status"]) => {
    await updateDoc(doc(db, "tasks", taskId), { status: newStatus });
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const openAddTask = () => {
    const nextNum = tasks.length > 0 ? Math.max(...tasks.map((t) => t.number || 0)) + 1 : 1;
    setTaskFormMode("add");
    setFormTaskId(`TASK-${nextNum.toString().padStart(2, "0")}`);
    setFormTitle(""); setFormCategory("developer"); setFormReward(""); setFormRewardRbnt("");
    setFormPaymentSplit("100% RBNT"); setFormStatus("open"); setFormShortDesc(""); setFormProblem("");
    setFormDeliverables([""]); setFormBenchmarks([""]); setFormFailure([""]);
    setFormTechnicalReqs([""]); setFormInfrastructure([""]); setFormError("");
    setTaskFormOpen(true);
  };

  const openEditTask = (task: Task) => {
    setTaskFormMode("edit");
    setFormTaskId(task.id); setFormTitle(task.title); setFormCategory(task.category);
    setFormReward(task.reward.toString()); setFormRewardRbnt(task.rewardRbnt?.toString() ?? "");
    setFormPaymentSplit(task.paymentSplit); setFormStatus(task.status);
    setFormShortDesc(task.shortDescription); setFormProblem(task.problem);
    setFormDeliverables([...task.deliverables, ""]);
    setFormBenchmarks([...task.qualityBenchmarks, ""]);
    setFormFailure([...task.failureCriteria, ""]);
    setFormTechnicalReqs([...(task.technicalRequirements ?? []), ""]);
    setFormInfrastructure([...(task.infrastructure ?? []), ""]);
    setFormError("");
    setTaskFormOpen(true);
  };

  const saveTask = async () => {
    if (!formTaskId.trim() || !formTitle.trim()) {
      setFormError("Task ID and Title are required.");
      return;
    }
    setFormSaving(true);
    setFormError("");
    try {
      const existingNum = taskFormMode === "edit"
        ? (tasks.find((t) => t.id === formTaskId)?.number ?? 0)
        : (tasks.length > 0 ? Math.max(...tasks.map((t) => t.number || 0)) + 1 : 1);

      const rewardUsd = parseFloat(formReward) || 0;
      const rewardRbnt = parseInt(formRewardRbnt) || 0;

      const taskData = {
        number: existingNum,
        title: formTitle.trim(),
        category: formCategory,
        reward: rewardUsd,
        rewardRbnt,
        reviewerComp: Math.round(rewardUsd * 0.2 * 100) / 100,
        paymentSplit: formPaymentSplit.trim() || "100% RBNT",
        status: formStatus,
        shortDescription: formShortDesc.trim(),
        problem: formProblem.trim(),
        deliverables: formDeliverables.filter((d) => d.trim()),
        qualityBenchmarks: formBenchmarks.filter((b) => b.trim()),
        failureCriteria: formFailure.filter((f) => f.trim()),
        technicalRequirements: formTechnicalReqs.filter((r) => r.trim()),
        infrastructure: formInfrastructure.filter((r) => r.trim()),
      };

      await setDoc(doc(db, "tasks", formTaskId.trim().toUpperCase()), taskData);

      const updated = { id: formTaskId.trim().toUpperCase(), ...taskData } as Task;
      if (taskFormMode === "add") {
        setTasks((prev) => [...prev, updated].sort((a, b) => (a.number || 0) - (b.number || 0)));
      } else {
        setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      }
      setTaskFormOpen(false);
    } catch {
      setFormError("Failed to save. Please try again.");
    } finally {
      setFormSaving(false);
    }
  };

  const deleteTask = async (id: string) => {
    await deleteDoc(doc(db, "tasks", id));
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDeleteConfirmId(null);
  };

  const approvedSubmissions = submissions.filter((s) => s.status === "approved" && !s.paymentProcessed);

  const exportPaymentBatch = () => {
    const rows = [
      ["Task ID", "Task Title", "Contributor Wallet", "Contributor $", "Reviewer Wallet", "Reviewer $", "Split"],
      ...approvedSubmissions.map((s) => {
        const task = tasks.find((t) => t.id === s.taskId);
        return [s.taskId, s.taskTitle, s.walletAddress, task?.reward ?? "", s.reviewerWallet ?? "", task?.reviewerComp ?? "", task?.paymentSplit ?? ""];
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
    <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const reviewerCompRbntDisplay = formRewardRbnt
    ? `${Math.round(parseInt(formRewardRbnt) * 0.2).toLocaleString()} RBNT`
    : "";
  const reviewerCompUsdDisplay = formReward
    ? `(~$${Math.round(parseFloat(formReward) * 0.2 * 100) / 100})`
    : "";

  const stats = [
    { label: "Total Submissions", value: submissions.length },
    { label: "Under Review", value: submissions.filter((s) => s.status === "under_review").length },
    { label: "Approved", value: submissions.filter((s) => s.status === "approved").length },
    { label: "Pending Payment", value: approvedSubmissions.length },
    { label: "Active Tasks", value: tasks.filter((t) => t.status === "open").length },
    { label: "Total Users", value: users.length },
  ];

  const TABS: { value: AdminTab; label: string }[] = [
    { value: "submissions", label: "Submissions" },
    { value: "tasks", label: "Tasks" },
    { value: "users", label: "Users" },
    { value: "payments", label: "Payments" },
  ];

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Admin Dashboard</h1>
          <p className="text-[#888888] text-sm mt-1">Full task board management and oversight.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <p className="text-2xl font-bold text-[#1A1A2E]">{s.value}</p>
              <p className="text-xs text-[#888888] mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-[#E8EBF0] rounded-lg p-1 w-fit shadow-sm">
          {TABS.map((t) => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.value ? "bg-[#E63329] text-white shadow-sm" : "text-[#888888] hover:text-[#1A1A2E]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SUBMISSIONS TAB ── */}
        {tab === "submissions" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
              <p className="text-white font-semibold text-sm">All Submissions ({submissions.length})</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                    <th className="text-left px-4 py-3 font-semibold">Task</th>
                    <th className="text-left px-4 py-3 font-semibold">Contributor</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Score</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Links</th>
                    <th className="text-left px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub, i) => (
                    <tr key={sub.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-[#1A1A2E]">{sub.taskId}</p>
                        <p className="text-xs text-[#888888] truncate max-w-[140px]">{sub.taskTitle}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-[#1A1A2E]">{sub.walletAddress?.slice(0, 6)}…{sub.walletAddress?.slice(-4)}</p>
                        {sub.discordHandle && <p className="text-xs text-[#888888]">{sub.discordHandle}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`badge-${sub.status}`}>{sub.status?.replace(/_/g, " ")}</span>
                          {sub.adminOverride && <span className="badge bg-yellow-50 text-yellow-700">overridden</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {sub.reviewTotalScore ? <span className="font-bold text-[#E63329]">{sub.reviewTotalScore}/35</span> : "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#888888]">
                        {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {sub.githubLink && <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#E63329] font-semibold hover:underline">GitHub</a>}
                          {sub.liveLink && <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-[#E63329] font-semibold hover:underline">Live</a>}
                          {sub.fileUrl && <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#E63329] font-semibold hover:underline">File</a>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => setAuditSub(sub)}
                            className="text-xs text-[#E63329] font-semibold hover:underline text-left"
                          >
                            View
                          </button>
                          {sub.status === "under_review" ? (
                            <a href="/reviewer" className="text-xs text-[#888888] font-semibold hover:underline">Review</a>
                          ) : (
                            <button
                              onClick={() => { setOverrideSub(sub); setOverrideDecision(""); setOverrideFeedback(""); }}
                              className="text-xs text-[#888888] font-semibold hover:text-[#E63329] transition-colors text-left"
                            >
                              Override
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">No submissions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TASKS TAB ── */}
        {tab === "tasks" && (
          <div>
            <div className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
                <p className="text-white font-semibold text-sm">All Tasks ({tasks.length})</p>
                <button onClick={openAddTask} className="btn-primary text-xs px-3 py-1.5">+ Add Task</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                      <th className="text-left px-4 py-3 font-semibold">ID</th>
                      <th className="text-left px-4 py-3 font-semibold">Title</th>
                      <th className="text-left px-4 py-3 font-semibold">Category</th>
                      <th className="text-left px-4 py-3 font-semibold">Reward</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, i) => (
                      <tr key={task.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1A2E]">{task.id}</td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-[#1A1A2E] max-w-[200px] truncate">{task.title}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-[#E63329]">{formatReward(task.rewardRbnt, task.reward)}</td>
                        <td className="px-4 py-3">
                          <select
                            value={task.status}
                            onChange={(e) => updateTaskStatus(task.id, e.target.value as Task["status"])}
                            className="text-xs border border-[#E8EBF0] rounded-lg px-2 py-1 bg-white text-[#1A1A2E] focus:outline-none focus:border-[#E63329]"
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>{getStatusLabel(s)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEditTask(task)} className="text-xs text-[#E63329] font-semibold hover:underline">Edit</button>
                            <button onClick={() => setDeleteConfirmId(task.id)} className="text-xs text-[#AAAAAA] hover:text-red-500 font-semibold transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {tasks.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <p className="text-sm text-[#AAAAAA] mb-3">No tasks yet.</p>
                          <button onClick={openAddTask} className="btn-primary text-xs">Add Your First Task</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS TAB ── */}
        {tab === "users" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
              <p className="text-white font-semibold text-sm">All Users ({users.length})</p>
              <p className="text-white/50 text-xs">Change roles via the dropdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                    <th className="text-left px-4 py-3 font-semibold">Wallet Address</th>
                    <th className="text-left px-4 py-3 font-semibold">Discord</th>
                    <th className="text-left px-4 py-3 font-semibold">Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Joined</th>
                    <th className="text-left px-4 py-3 font-semibold">Change Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className={`border-b border-[#F4F5F7] ${u.suspended ? "opacity-50" : i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                      <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">{u.walletAddress}</td>
                      <td className="px-4 py-3 text-xs text-[#888888]">{u.discordHandle || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`badge ${
                            u.role === "admin" ? "bg-[#FEF0EF] text-[#E63329]" :
                            u.role === "reviewer" ? "bg-blue-50 text-blue-700" :
                            "bg-[#F4F5F7] text-[#888888]"
                          }`}>{u.role}</span>
                          {u.suspended && (
                            <span className="badge bg-red-50 text-red-600">suspended</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#888888]">
                        {u.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {u.role !== "admin" ? (
                          <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)}
                            className="text-xs border border-[#E8EBF0] rounded-lg px-2 py-1 bg-white text-[#1A1A2E] focus:outline-none focus:border-[#E63329]">
                            <option value="contributor">Contributor</option>
                            <option value="reviewer">Reviewer</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span className="text-xs text-[#AAAAAA]">Admin</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.role !== "admin" && (
                          <button
                            onClick={() => suspendUser(u.id, !u.suspended)}
                            className={`text-xs font-semibold transition-colors ${
                              u.suspended
                                ? "text-green-600 hover:text-green-800"
                                : "text-red-500 hover:text-red-700"
                            }`}
                          >
                            {u.suspended ? "Unsuspend" : "Suspend"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {tab === "payments" && (
          <div>
            <div className="bg-[#FEF0EF] border border-[#E63329]/20 rounded-xl p-4 mb-6">
              <p className="text-sm font-semibold text-[#E63329] mb-1">Payment Process</p>
              <p className="text-xs text-[#555555]">
                Admins compile approved payment details and relay them to the High Council for multi-sig disbursement.
                RBNT is paid at market price on the day of disbursement.
              </p>
            </div>
            <div className="card overflow-hidden mb-4">
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
                <p className="text-white font-semibold text-sm">Approved: Pending Payment ({approvedSubmissions.length})</p>
                {approvedSubmissions.length > 0 && (
                  <button onClick={exportPaymentBatch} className="btn-primary text-xs px-3 py-1.5">Export CSV</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                      <th className="text-left px-4 py-3 font-semibold">Task</th>
                      <th className="text-left px-4 py-3 font-semibold">Contributor Wallet</th>
                      <th className="text-left px-4 py-3 font-semibold">Contributor Pay</th>
                      <th className="text-left px-4 py-3 font-semibold">Reviewer Wallet</th>
                      <th className="text-left px-4 py-3 font-semibold">Reviewer Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedSubmissions.map((sub, i) => {
                      const task = tasks.find((t) => t.id === sub.taskId);
                      return (
                        <tr key={sub.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1A2E]">{sub.taskId}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">{sub.walletAddress}</td>
                          <td className="px-4 py-3 font-bold text-xs text-[#E63329]">{task ? formatReward(task.rewardRbnt, task.reward) : "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[#888888]">{sub.reviewerWallet || "-"}</td>
                          <td className="px-4 py-3 text-xs text-[#888888]">{task?.reviewerComp ? formatReward(task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined, task.reviewerComp) : "N/A"}</td>
                        </tr>
                      );
                    })}
                    {approvedSubmissions.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">No approved submissions pending payment.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {approvedSubmissions.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-[#888888] mb-3 uppercase tracking-wide">Batch Summary</p>
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-[#AAAAAA]">Total Contributor Pay</p>
                    <p className="text-xl font-bold text-[#E63329]">
                      ${approvedSubmissions.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.reward || 0), 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#AAAAAA]">Total Reviewer Pay</p>
                    <p className="text-xl font-bold text-[#1A1A2E]">
                      ${approvedSubmissions.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.reviewerComp || 0), 0)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── TASK FORM PANEL ── */}
      {taskFormOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setTaskFormOpen(false)} />
          <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl overflow-hidden">
            {/* Panel header */}
            <div className="px-6 py-4 border-b border-[#E8EBF0] flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#2C2C2C" }}>
              <div>
                <h2 className="font-bold text-white">
                  {taskFormMode === "add" ? "Add New Task" : `Edit ${formTaskId}`}
                </h2>
                <p className="text-white/50 text-xs mt-0.5">All fields will be visible to contributors</p>
              </div>
              <button onClick={() => setTaskFormOpen(false)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Task ID */}
              <div>
                <label className="label">Task ID</label>
                {taskFormMode === "add" ? (
                  <input className="input font-mono" value={formTaskId}
                    onChange={(e) => setFormTaskId(e.target.value.toUpperCase())}
                    placeholder="TASK-16" />
                ) : (
                  <div className="input bg-[#F4F5F7] text-[#AAAAAA] font-mono cursor-not-allowed">{formTaskId}</div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="label">Title <span className="text-[#E63329]">*</span></label>
                <input className="input" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Task title" />
              </div>

              {/* Category + Status row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={formCategory} onChange={(e) => setFormCategory(e.target.value as TaskCategory)}>
                    {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={formStatus} onChange={(e) => setFormStatus(e.target.value as Task["status"])}>
                    {TASK_STATUSES.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                  </select>
                </div>
              </div>

              {/* Reward + Split */}
              <div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Reward (RBNT)</label>
                    <input className="input font-mono" type="number" value={formRewardRbnt} onChange={(e) => setFormRewardRbnt(e.target.value)} placeholder="10678" />
                  </div>
                  <div>
                    <label className="label">USD Equivalent</label>
                    <input className="input font-mono" type="number" value={formReward} onChange={(e) => setFormReward(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="label">Payment Split</label>
                    <input className="input" value={formPaymentSplit} onChange={(e) => setFormPaymentSplit(e.target.value)} placeholder="100% RBNT" />
                  </div>
                </div>

                {/* Auto-calculated reviewer comp */}
                {(formRewardRbnt || formReward) && (
                  <div className="mt-2 rounded-lg border border-[#E8EBF0] bg-[#F4F5F7] px-3 py-2 flex items-center gap-2 flex-wrap text-xs text-[#555555]">
                    <svg className="w-3 h-3 text-[#AAAAAA] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[#AAAAAA]">Reviewer comp (20%):</span>
                    <span className="font-semibold text-[#1A1A2E]">
                      {reviewerCompRbntDisplay}
                      {reviewerCompRbntDisplay && reviewerCompUsdDisplay ? " " : ""}
                      {reviewerCompUsdDisplay}
                    </span>
                  </div>
                )}

                {/* RBNT Price Oracle */}
                <div className="mt-2 rounded-lg border border-[#E8EBF0] bg-[#F4F5F7] px-3 py-2.5 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={fetchRbntPrice}
                    disabled={rbntPriceLoading}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#E63329] hover:underline disabled:opacity-50 flex-shrink-0"
                  >
                    {rbntPriceLoading ? (
                      <span className="w-3 h-3 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    Fetch RBNT price
                  </button>

                  {rbntPriceError && (
                    <p className="text-xs text-red-500">{rbntPriceError}</p>
                  )}

                  {rbntPrice && !rbntPriceError && (
                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      <span className="text-[#AAAAAA]">1 RBNT = <span className="font-mono font-semibold text-[#555555]">${rbntPrice.toFixed(6)}</span></span>
                      {toRbnt(formReward) && (
                        <span className="text-[#555555]">
                          Reward: <span className="font-semibold text-[#1A1A2E]">{toRbnt(formReward)} RBNT</span>
                        </span>
                      )}

                    </div>
                  )}
                </div>
              </div>

              {/* Short description */}
              <div>
                <label className="label">Short Description</label>
                <textarea className="input resize-none" rows={2} value={formShortDesc}
                  onChange={(e) => setFormShortDesc(e.target.value)} placeholder="1-2 sentence summary shown on the task card" />
              </div>

              {/* Problem */}
              <div>
                <label className="label">Problem Statement</label>
                <textarea className="input resize-none" rows={3} value={formProblem}
                  onChange={(e) => setFormProblem(e.target.value)} placeholder="Why does this task exist? What problem does it solve?" />
              </div>

              {/* Technical Requirements */}
              <ListEditor label="Technical Requirements" items={formTechnicalReqs} setItems={setFormTechnicalReqs} placeholder="Requirement" />

              {/* Deliverables */}
              <ListEditor label="Required Deliverables" items={formDeliverables} setItems={setFormDeliverables} placeholder="Deliverable" />

              {/* Quality benchmarks */}
              <ListEditor label="Quality Benchmarks" items={formBenchmarks} setItems={setFormBenchmarks} placeholder="Benchmark" />

              {/* Failure criteria */}
              <ListEditor label="Failure Criteria" items={formFailure} setItems={setFormFailure} placeholder="Criterion" />

              {/* Infrastructure / Resources */}
              <ListEditor label="Infrastructure / Resources" items={formInfrastructure} setItems={setFormInfrastructure} placeholder="Resource name or URL" />
            </div>

            {/* Panel footer */}
            <div className="px-6 py-4 border-t border-[#E8EBF0] flex items-center gap-3 flex-shrink-0 bg-[#F4F5F7]">
              <button onClick={saveTask} disabled={formSaving} className="btn-primary">
                {formSaving ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                ) : taskFormMode === "add" ? "Create Task" : "Save Changes"}
              </button>
              <button onClick={() => setTaskFormOpen(false)} className="btn-secondary">Cancel</button>
              {formError && <p className="text-red-600 text-xs">{formError}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-bold text-[#1A1A2E] mb-1">Delete Task?</h3>
            <p className="text-sm text-[#888888] mb-5">
              Permanently delete <span className="font-mono font-semibold text-[#1A1A2E]">{deleteConfirmId}</span>?
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteTask(deleteConfirmId)}
                className="btn-primary" style={{ backgroundColor: "#DC2626" }}>
                Delete
              </button>
              <button onClick={() => setDeleteConfirmId(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT PANEL ── */}
      {auditSub && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setAuditSub(null)} />
          <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8EBF0] flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#2C2C2C" }}>
              <div>
                <h2 className="font-bold text-white text-sm">Submission Audit</h2>
                <p className="text-white/50 text-xs font-mono">{auditSub.taskId}</p>
              </div>
              <button onClick={() => setAuditSub(null)} className="text-white/50 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Submission info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Submission</p>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[#AAAAAA]">Contributor: </span>
                    <span className="font-mono text-[#1A1A2E]">{auditSub.walletAddress}</span>
                  </div>
                  {auditSub.discordHandle && (
                    <div><span className="text-[#AAAAAA]">Discord: </span><span className="text-[#1A1A2E]">{auditSub.discordHandle}</span></div>
                  )}
                  <div>
                    <span className="text-[#AAAAAA]">Submitted: </span>
                    <span className="text-[#555555]">{auditSub.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}</span>
                  </div>
                  <div className="flex gap-3 pt-1 flex-wrap">
                    {auditSub.githubLink && <a href={auditSub.githubLink} target="_blank" rel="noopener noreferrer" className="text-[#E63329] font-semibold hover:underline">GitHub →</a>}
                    {auditSub.liveLink && <a href={auditSub.liveLink} target="_blank" rel="noopener noreferrer" className="text-[#E63329] font-semibold hover:underline">Live →</a>}
                    {auditSub.fileUrl && <a href={auditSub.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[#E63329] font-semibold hover:underline">File →</a>}
                  </div>
                  {auditSub.notes && (
                    <div className="mt-2 p-3 bg-[#F4F5F7] rounded-lg">
                      <p className="text-[#AAAAAA] mb-1">Notes from contributor</p>
                      <p className="text-[#555555] leading-relaxed">{auditSub.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Review summary */}
              {auditSub.reviewerWallet && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Review</p>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-[#F4F5F7] rounded-lg p-3">
                      <p className="text-xs text-[#AAAAAA] mb-1">Score</p>
                      <p className="text-xl font-bold text-[#E63329]">
                        {auditSub.reviewTotalScore ?? "?"}<span className="text-sm font-normal text-[#AAAAAA]">/35</span>
                      </p>
                    </div>
                    <div className="bg-[#F4F5F7] rounded-lg p-3">
                      <p className="text-xs text-[#AAAAAA] mb-1">Decision</p>
                      <span className={`badge-${auditSub.status}`}>{auditSub.status?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="bg-[#F4F5F7] rounded-lg p-3">
                      <p className="text-xs text-[#AAAAAA] mb-1">Reviewed</p>
                      <p className="text-xs text-[#555555]">{auditSub.reviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}</p>
                    </div>
                  </div>
                  <div className="text-xs mb-3">
                    <span className="text-[#AAAAAA]">Reviewer wallet: </span>
                    <span className="font-mono text-[#555555]">{auditSub.reviewerWallet}</span>
                  </div>

                  {/* Rubric breakdown */}
                  {auditSub.reviewScores?.length > 0 && (
                    <div className="space-y-2">
                      {[
                        "Deliverable completeness",
                        "Quality Benchmarks met",
                        "Technical accuracy",
                        "Documentation quality",
                        "Test coverage / verification",
                        "Failure Criteria avoided",
                        "Overall standard",
                      ].map((criterion, i) => (
                        <div key={i} className="border border-[#E8EBF0] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-[#1A1A2E]">{criterion}</p>
                            <div className="flex items-center gap-1.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <div key={s} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                                  auditSub.reviewScores[i] === s ? "bg-[#E63329] text-white" : "bg-[#F4F5F7] text-[#AAAAAA]"
                                }`}>{s}</div>
                              ))}
                            </div>
                          </div>
                          {auditSub.reviewJustifications?.[i] && (
                            <p className="text-xs text-[#555555] italic">{auditSub.reviewJustifications[i]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {auditSub.requiredChanges && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
                      <p className="font-semibold text-yellow-800 mb-1">Required Changes</p>
                      <p className="text-yellow-700 whitespace-pre-line">{auditSub.requiredChanges}</p>
                      {auditSub.revisionDeadline && (
                        <p className="text-yellow-600 mt-1">Deadline: {auditSub.revisionDeadline}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Admin override history */}
              {auditSub.adminOverride && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-3">Admin Override</p>
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
                    <div className="mb-1">
                      <span className="text-[#AAAAAA]">Overridden by: </span>
                      <span className="font-mono text-[#555555]">{auditSub.adminOverrideWallet}</span>
                    </div>
                    <p className="text-yellow-700">{auditSub.adminOverrideFeedback}</p>
                  </div>
                </div>
              )}

              {/* Chat */}
              <SubmissionChat submissionId={auditSub.id} />
            </div>
          </div>
        </div>
      )}

      {/* ── OVERRIDE MODAL ── */}
      {overrideSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-[#E8EBF0] flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
              <div>
                <p className="text-white font-bold text-sm">Admin Override</p>
                <p className="text-white/50 text-xs font-mono">{overrideSub.taskId}</p>
              </div>
              <button onClick={() => setOverrideSub(null)} className="text-white/50 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Existing review summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#F4F5F7] rounded-lg p-3">
                  <p className="text-xs text-[#AAAAAA] mb-1">Score</p>
                  <p className="text-lg font-bold text-[#E63329]">
                    {overrideSub.reviewTotalScore ?? "?"}<span className="text-xs font-normal text-[#AAAAAA]">/35</span>
                  </p>
                </div>
                <div className="bg-[#F4F5F7] rounded-lg p-3">
                  <p className="text-xs text-[#AAAAAA] mb-1">Decision</p>
                  <p className="text-sm font-semibold text-[#1A1A2E] capitalize">{overrideSub.reviewDecision ?? "none"}</p>
                </div>
                <div className="bg-[#F4F5F7] rounded-lg p-3">
                  <p className="text-xs text-[#AAAAAA] mb-1">Status</p>
                  <span className={`badge-${overrideSub.status}`}>{overrideSub.status?.replace(/_/g, " ")}</span>
                </div>
              </div>

              {overrideSub.reviewerWallet && (
                <div className="text-xs">
                  <span className="text-[#AAAAAA]">Reviewed by: </span>
                  <span className="font-mono text-[#555555]">{overrideSub.reviewerWallet}</span>
                </div>
              )}

              <div className="bg-[#FEF0EF] rounded-lg p-3 text-xs text-[#555555]">
                <span className="font-semibold text-[#E63329]">Warning: </span>
                This changes the submission status and affects payment eligibility. Document your reason clearly.
              </div>

              <div>
                <p className="label mb-3">New Decision</p>
                <div className="flex gap-3">
                  {(["approved", "rejected"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setOverrideDecision(d)}
                      className={`px-5 py-2 rounded text-sm font-semibold transition-colors capitalize ${
                        overrideDecision === d
                          ? d === "approved" ? "bg-green-600 text-white" : "bg-red-600 text-white"
                          : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#555555]"
                      }`}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Override Reason <span className="text-[#E63329]">*</span></label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Explain why this decision is being overridden. Reference the specific benchmark or failure criterion."
                  value={overrideFeedback}
                  onChange={(e) => setOverrideFeedback(e.target.value)}
                  maxLength={500}
                />
                <p className="text-xs text-[#AAAAAA] mt-1 text-right">{overrideFeedback.length}/500</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#E8EBF0] flex items-center gap-3 bg-[#F4F5F7]">
              <button
                onClick={applyAdminOverride}
                disabled={overriding || !overrideDecision || !overrideFeedback.trim()}
                className="btn-primary"
              >
                {overriding ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Applying...</>
                ) : "Apply Override"}
              </button>
              <button onClick={() => setOverrideSub(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

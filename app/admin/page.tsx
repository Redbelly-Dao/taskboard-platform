"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDocs, getDoc, doc, updateDoc, setDoc, deleteDoc, addDoc,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, TASK_STATUSES, getCategoryLabel, getStatusLabel, getSubmissionStatusLabel, formatReward, displayName } from "@/lib/tasks";
import { LEDGER_STATUSES, getLedgerStatusLabel, deriveLedgerStatus, pickWinner, ledgerProjection, deliverableLinkOf } from "@/lib/ledger";
import Navbar from "@/components/Navbar";
import SubmissionChat from "@/components/SubmissionChat";

type AdminTab = "submissions" | "tasks" | "users" | "payments" | "audit" | "reviewers" | "feedback";

const TASK_CATEGORIES: TaskCategory[] = ["developer", "design", "research", "documentation", "content"];
const SUB_STATUS_OPTIONS = ["all", "under_review", "approved", "rejected", "revision_requested"] as const;

const AUDIT_ACTION_LABELS: Record<string, string> = {
  admin_override: "Submission Override",
  role_change: "Role Changed",
  user_suspended: "User Suspended",
  user_unsuspended: "User Unsuspended",
  payment_marked_paid: "Payment Marked Paid",
  payment_winner_selected: "Payment Winner Selected",
  task_deleted: "Task Deleted",
};

// Pill colors for ledger statuses, themed to the app palette.
const LEDGER_STATUS_COLOR: Record<string, string> = {
  open: "bg-[#F4F5F7] text-[#555555]",
  in_progress: "bg-[#EFF6FF] text-[#1D4ED8]",
  in_review: "bg-[#EFF6FF] text-[#1D4ED8]",
  revision: "bg-[#FEFCE8] text-[#A16207]",
  approved: "bg-[#F0FDF4] text-[#15803D]",
  awaiting_payment: "bg-[#FEF0EF] text-[#E63329]",
  paid: "bg-[#F0FDF4] text-[#15803D]",
  paused: "bg-[#F3F4F6] text-[#6B7280]",
  rejected: "bg-[#FEF2F2] text-[#CC2820]",
};

const RUBRIC_CRITERIA = [
  "Deliverable completeness",
  "Quality Benchmarks met",
  "Technical accuracy",
  "Documentation quality",
  "Test coverage / verification",
  "Failure Criteria avoided",
  "Overall standard",
];

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
  const [ledgerDocs, setLedgerDocs] = useState<Record<string, any>>({});
  const [expandedLedger, setExpandedLedger] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Audit panel (view submission detail)
  const [auditSub, setAuditSub] = useState<any>(null);

  // Override modal
  const [overrideSub, setOverrideSub] = useState<any>(null);
  const [overrideDecision, setOverrideDecision] = useState<"approved" | "rejected" | "under_review" | "">("");
  const [overrideFeedback, setOverrideFeedback] = useState("");
  const [overriding, setOverriding] = useState(false);

  // Audit log tab
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Feedback tab
  const [feedbackItems, setFeedbackItems] = useState<any[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Submission search + filter
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string>("all");

  // User search
  const [userSearch, setUserSearch] = useState("");

  // Mark as paid
  const [payConfirmId, setPayConfirmId] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  // Reviewer detail panel
  const [selectedReviewer, setSelectedReviewer] = useState<string | null>(null);
  const [expandedReviewSub, setExpandedReviewSub] = useState<string | null>(null);

  // RBNT price oracle
  const [rbntPrice, setRbntPrice] = useState<number | null>(null);
  const [rbntPriceLoading, setRbntPriceLoading] = useState(false);
  const [rbntPriceError, setRbntPriceError] = useState("");

  // Task form
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
  const [formMaxSubs, setFormMaxSubs] = useState("5"); // submission cap, editable
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || (appUser && appUser.role !== "admin"))) {
      router.replace("/dashboard");
    }
  }, [user, appUser, loading, router]);

  const doFetchAll = async () => {
    const [subsSnap, usersSnap, tasksSnap, ledgerSnap] = await Promise.all([
      getDocs(query(collection(db, "submissions"), orderBy("createdAt", "desc"))),
      getDocs(collection(db, "users")),
      getDocs(collection(db, "tasks")),
      getDocs(collection(db, "ledger")),
    ]);
    setSubmissions(subsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    const taskList = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
    taskList.sort((a, b) => (a.number || 0) - (b.number || 0));
    setTasks(taskList);
    const lmap: Record<string, any> = {};
    ledgerSnap.docs.forEach((d) => { lmap[d.id] = { id: d.id, ...d.data() }; });
    setLedgerDocs(lmap);
    setDataLoading(false);
  };

  useEffect(() => {
    if (!user || appUser?.role !== "admin") return;
    doFetchAll();
  }, [user, appUser]);

  // Submission cycle: a manually-advanced batch counter. New submissions are
  // stamped with the current value; bumping it resets everyone's per-cycle
  // cap without touching any existing data.
  const [cycle, setCycle] = useState<number | null>(null);
  useEffect(() => {
    if (!user || appUser?.role !== "admin") return;
    getDoc(doc(db, "config", "cycle")).then((snap) => {
      setCycle(snap.exists() ? (snap.data().current ?? 1) : 1);
    });
  }, [user, appUser]);

  const bumpCycle = async (delta: number) => {
    const next = Math.max(1, (cycle ?? 1) + delta);
    setCycle(next);
    await setDoc(doc(db, "config", "cycle"), { current: next }, { merge: true });
  };

  // Board-wide maintenance pause. When on, everyone except admins sees a paused
  // screen instead of the board; the public /ledger stays open. Admins keep full
  // access so they can lift the pause.
  const [boardPaused, setBoardPaused] = useState(false);
  const [pauseMessage, setPauseMessage] = useState("");
  useEffect(() => {
    if (!user || appUser?.role !== "admin") return;
    getDoc(doc(db, "config", "board")).then((snap) => {
      setBoardPaused(!!snap.data()?.paused);
      setPauseMessage(snap.data()?.message ?? "");
    });
  }, [user, appUser]);

  const toggleBoardPause = async () => {
    const next = !boardPaused;
    if (next && !confirm("Pause the whole Task Board? Everyone except admins will see a maintenance screen. The public ledger stays visible.")) return;
    setBoardPaused(next);
    await setDoc(doc(db, "config", "board"), { paused: next, message: pauseMessage || "" }, { merge: true });
  };

  const savePauseMessage = async () => {
    await setDoc(doc(db, "config", "board"), { message: pauseMessage || "" }, { merge: true });
  };

  // Display-only order: completed tasks sink to the bottom, otherwise the
  // existing by-number order is preserved. Deliberately not mutating `tasks`
  // itself, since openAddTask/saveTask compute the next TASK-NN id from
  // Math.max(...tasks.map(t => t.number)).
  const displayTasks = useMemo(
    () => [...tasks].sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed")),
    [tasks]
  );

  const refreshData = async () => {
    setDataLoading(true);
    await doFetchAll();
  };

  useEffect(() => {
    if (tab !== "audit" || !user || appUser?.role !== "admin") return;
    setAuditLoading(true);
    getDocs(query(collection(db, "adminAuditLog"), orderBy("timestamp", "desc")))
      .then((snap) => {
        setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAuditLoading(false);
      })
      .catch(() => setAuditLoading(false));
  }, [tab, user, appUser]);

  const refreshAuditLog = () => {
    setAuditLoading(true);
    getDocs(query(collection(db, "adminAuditLog"), orderBy("timestamp", "desc")))
      .then((snap) => {
        setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAuditLoading(false);
      })
      .catch(() => setAuditLoading(false));
  };

  const refreshFeedback = () => {
    setFeedbackLoading(true);
    getDocs(query(collection(db, "feedback"), orderBy("createdAt", "desc")))
      .then((snap) => {
        setFeedbackItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setFeedbackLoading(false);
      })
      .catch(() => setFeedbackLoading(false));
  };

  useEffect(() => {
    if (tab !== "feedback" || !user || appUser?.role !== "admin") return;
    refreshFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, appUser]);

  const logAdminAction = async (action: string, details: Record<string, any>) => {
    try {
      await addDoc(collection(db, "adminAuditLog"), {
        action,
        adminUid: user?.uid,
        adminWallet: appUser?.walletAddress,
        ...details,
        timestamp: serverTimestamp(),
      });
    } catch { /* non-blocking */ }
  };

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

  const updateRole = async (userId: string, newRole: string) => {
    const oldRole = users.find((u) => u.id === userId)?.role;
    await updateDoc(doc(db, "users", userId), { role: newRole });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    await logAdminAction("role_change", { userId, oldRole, newRole });
  };

  const suspendUser = async (userId: string, suspend: boolean) => {
    const target = users.find((u) => u.id === userId);
    await updateDoc(doc(db, "users", userId), { suspended: suspend });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, suspended: suspend } : u));
    await logAdminAction(suspend ? "user_suspended" : "user_unsuspended", {
      userId,
      userWallet: target?.walletAddress,
    });
  };

  const applyAdminOverride = async () => {
    if (!overrideSub || !overrideDecision || !overrideFeedback.trim()) return;
    setOverriding(true);
    try {
      const newStatus =
        overrideDecision === "approved" ? "approved" :
        overrideDecision === "under_review" ? "under_review" :
        "rejected";
      await updateDoc(doc(db, "submissions", overrideSub.id), {
        status: newStatus,
        reviewDecision: overrideDecision === "under_review" ? null : overrideDecision,
        adminOverride: true,
        adminOverrideBy: user?.uid,
        adminOverrideWallet: appUser?.walletAddress,
        adminOverrideFeedback: overrideFeedback,
        adminOverrideAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(overrideDecision === "under_review" ? {
          reviewerId: null,
          reviewerWallet: null,
          reviewingBy: null,
          reviewingByWallet: null,
          reviewTotalScore: null,
          reviewScores: null,
          reviewJustifications: null,
          reviewDecision: null,
          reviewedAt: null,
          requiredChanges: null,
          revisionDeadline: null,
        } : {}),
      });
      setSubmissions((prev) => prev.map((s) =>
        s.id === overrideSub.id
          ? { ...s, status: newStatus, reviewDecision: overrideDecision === "under_review" ? null : overrideDecision, adminOverride: true }
          : s
      ));
      // Rejections free a cap slot: recompute the task's active (non-rejected) count.
      const activeCount = submissions.filter((s) =>
        s.taskId === overrideSub.taskId &&
        (s.id === overrideSub.id ? newStatus : s.status) !== "rejected"
      ).length;
      await updateDoc(doc(db, "tasks", overrideSub.taskId), { submissionCount: activeCount });
      await logAdminAction("admin_override", {
        submissionId: overrideSub.id,
        taskId: overrideSub.taskId,
        decision: overrideDecision,
        feedback: overrideFeedback,
        previousStatus: overrideSub.status,
      });
      setOverrideSub(null);
      setOverrideDecision("");
      setOverrideFeedback("");
    } catch {
      alert("Override failed. Please try again.");
    } finally {
      setOverriding(false);
    }
  };

  const subsForTask = (taskId: string) => submissions.filter((s) => s.taskId === taskId);

  // Write the community-safe projection to ledger/{taskId}. Auto-called after
  // any action that changes a task's public state (winner pick, mark paid,
  // status change, inline edit), keeping the public /ledger page current.
  // `subsOverride` lets callers pass freshly-mutated submissions before state
  // has flushed. Never writes PII.
  const publishLedger = async (taskId: string, subsOverride?: any[], taskOverride?: Task) => {
    const task = taskOverride ?? tasks.find((t) => t.id === taskId);
    if (!task) return;
    // Only completed tasks belong on the ledger. If a task is not (or no longer)
    // completed, remove any ledger entry so it never surfaces publicly, even if
    // it has approved submissions.
    if (task.status !== "completed") {
      if (ledgerDocs[taskId]) {
        await deleteDoc(doc(db, "ledger", taskId)).catch(() => {});
        setLedgerDocs((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
      }
      return;
    }
    const subs = subsOverride ?? subsForTask(taskId);
    const projection = ledgerProjection(task, subs, ledgerDocs[taskId] || {});
    await setDoc(doc(db, "ledger", taskId), { ...projection, updatedAt: serverTimestamp() }, { merge: true });
    setLedgerDocs((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), ...projection } }));
  };

  // Edit an admin-controlled ledger field (deliverable link, tx hash, status
  // override, usdt amount, dates, public note). Persists straight to the public
  // ledger doc and updates local state.
  const saveLedgerField = async (taskId: string, field: string, value: string) => {
    await setDoc(doc(db, "ledger", taskId), { [field]: value, taskId, updatedAt: serverTimestamp() }, { merge: true });
    setLedgerDocs((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), [field]: value } }));
  };

  const publishAllLedger = async () => {
    for (const t of tasks) await publishLedger(t.id);
    alert("Public ledger synced for all tasks.");
  };

  // Resolve a payment tie: mark one tied submission the winner and clear the
  // flag on the others for that task, so exactly one is payable.
  const choosePaymentWinner = async (taskId: string, subId: string) => {
    const group = submissions.filter((s) => s.taskId === taskId && s.status === "approved" && !s.paymentProcessed);
    await Promise.all(group.map((s) => updateDoc(doc(db, "submissions", s.id), { paymentWinner: s.id === subId })));
    const nextSubs = submissions.map((s) => group.some((g) => g.id === s.id) ? { ...s, paymentWinner: s.id === subId } : s);
    setSubmissions(nextSubs);
    await logAdminAction("payment_winner_selected", { taskId, submissionId: subId });
    await publishLedger(taskId, nextSubs.filter((s) => s.taskId === taskId));
  };

  const markAsPaid = async (subId: string) => {
    setMarkingPaid(true);
    try {
      const sub = submissions.find((s) => s.id === subId);
      await updateDoc(doc(db, "submissions", subId), {
        paymentProcessed: true,
        paymentProcessedAt: serverTimestamp(),
        paymentProcessedBy: user?.uid,
        paymentProcessedByWallet: appUser?.walletAddress,
      });
      const nextSubs = submissions.map((s) => s.id === subId ? { ...s, paymentProcessed: true, paymentProcessedAt: { seconds: Date.now() / 1000 } } : s);
      setSubmissions(nextSubs);
      await logAdminAction("payment_marked_paid", {
        submissionId: subId,
        taskId: sub?.taskId,
        contributorWallet: sub?.walletAddress,
      });
      if (sub?.taskId) await publishLedger(sub.taskId, nextSubs.filter((s) => s.taskId === sub.taskId));
      setPayConfirmId(null);
    } catch {
      alert("Failed to mark as paid. Try again.");
    } finally {
      setMarkingPaid(false);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: Task["status"]) => {
    await updateDoc(doc(db, "tasks", taskId), { status: newStatus });
    const nextTasks = tasks.map((t) => t.id === taskId ? { ...t, status: newStatus } : t);
    setTasks(nextTasks);
    // Publish to (or remove from) the public ledger based on the NEW status:
    // marking completed adds it, moving off completed removes it.
    await publishLedger(taskId, subsForTask(taskId), nextTasks.find((t) => t.id === taskId));
  };

  const openAddTask = () => {
    const nextNum = tasks.length > 0 ? Math.max(...tasks.map((t) => t.number || 0)) + 1 : 1;
    setTaskFormMode("add");
    setFormTaskId(`TASK-${nextNum.toString().padStart(2, "0")}`);
    setFormTitle(""); setFormCategory("developer"); setFormReward(""); setFormRewardRbnt("");
    setFormPaymentSplit("100% RBNT"); setFormStatus("open"); setFormShortDesc(""); setFormProblem("");
    setFormDeliverables([""]); setFormBenchmarks([""]); setFormFailure([""]);
    setFormTechnicalReqs([""]); setFormInfrastructure([""]); setFormMaxSubs("5"); setFormError("");
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
    setFormMaxSubs((task.maxSubmissions ?? 5).toString());
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
        maxSubmissions: parseInt(formMaxSubs) || 5,
      };

      // merge so editing a task preserves the server-maintained submissionCount
      // (it is not part of the form) instead of wiping it back to undefined.
      await setDoc(doc(db, "tasks", formTaskId.trim().toUpperCase()), taskData, { merge: true });

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
    const task = tasks.find((t) => t.id === id);
    await deleteDoc(doc(db, "tasks", id));
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDeleteConfirmId(null);
    await logAdminAction("task_deleted", { taskId: id, taskTitle: task?.title });
  };

  // Payments are gated two ways: (1) the task must be marked Completed, and
  // (2) only the single highest-rubric approved submission per task is paid (the
  // winner). Losing approved submissions on the same task are never paid. A tie
  // (equal top score) is not auto-resolved: the admin picks the winner, which
  // sets `paymentWinner` on the chosen submission.
  const completedTaskIds = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
  // The ledger only tracks completed tasks (an approved submission alone does
  // not put a task on the ledger; the Completed tag does).
  const ledgerTasks = tasks.filter((t) => t.status === "completed");
  const scoreOf = (s: any) => s.reviewTotalScore ?? -1;

  const approvedUnpaidOnCompleted = submissions.filter(
    (s) => s.status === "approved" && !s.paymentProcessed && completedTaskIds.has(s.taskId)
  );
  const byTask = approvedUnpaidOnCompleted.reduce((acc, s) => {
    (acc[s.taskId] ||= []).push(s);
    return acc;
  }, {} as Record<string, any[]>);

  const payableWinners: any[] = [];
  const tiedTasks: { taskId: string; subs: any[] }[] = [];
  (Object.entries(byTask) as [string, any[]][]).forEach(([taskId, subs]) => {
    const maxScore = Math.max(...subs.map(scoreOf));
    const top = subs.filter((s) => scoreOf(s) === maxScore);
    if (top.length === 1) {
      payableWinners.push(top[0]);
    } else {
      // Honor an admin-picked winner only if it is still among the tied top set.
      const chosen = top.find((s) => s.paymentWinner);
      if (chosen) payableWinners.push(chosen);
      else tiedTasks.push({ taskId, subs: top });
    }
  });

  // Approved + unpaid, but the task is not Completed yet, so held out of the queue.
  const heldForCompletion = submissions.filter(
    (s) => s.status === "approved" && !s.paymentProcessed && !completedTaskIds.has(s.taskId)
  );
  const paidSubmissions = submissions.filter((s) => s.status === "approved" && s.paymentProcessed);

  // Reviewer visibility computations
  const activeReviews = submissions.filter((s) => s.reviewingBy);

  const reviewerStatsMap = submissions
    .filter((s) => s.reviewerWallet)
    .reduce((acc, s) => {
      const w = s.reviewerWallet;
      if (!acc[w]) acc[w] = { wallet: w, reviews: [] };
      acc[w].reviews.push(s);
      return acc;
    }, {} as Record<string, { wallet: string; reviews: any[] }>);

  type ReviewerEntry = { wallet: string; reviews: any[] };
  const reviewerStats = (Object.values(reviewerStatsMap) as ReviewerEntry[]).map((r) => ({
    wallet: r.wallet,
    total: r.reviews.length,
    approved: r.reviews.filter((s: any) => s.reviewDecision === "approved").length,
    revision: r.reviews.filter((s: any) => s.reviewDecision === "revision").length,
    rejected: r.reviews.filter((s: any) => s.reviewDecision === "rejected").length,
    avgScore: r.reviews.some((s: any) => s.reviewTotalScore)
      ? Math.round(r.reviews.reduce((sum: number, s: any) => sum + (s.reviewTotalScore || 0), 0) / r.reviews.filter((s: any) => s.reviewTotalScore).length)
      : null,
    lastReviewedAt: r.reviews.reduce(
      (latest: any, s: any) => ((s.reviewedAt?.seconds ?? 0) > (latest?.seconds ?? 0) ? s.reviewedAt : latest),
      null
    ),
  })).sort((a, b) => b.total - a.total);

  const selectedReviewerSubs = selectedReviewer
    ? submissions
        .filter((s) => s.reviewerWallet === selectedReviewer)
        .sort((a: any, b: any) => (b.reviewedAt?.seconds ?? 0) - (a.reviewedAt?.seconds ?? 0))
    : [];

  const walletToDiscord = new Map<string, string>(
    users
      .filter((u: any) => u.discordHandle)
      .map((u: any) => [u.walletAddress?.toLowerCase() as string, u.discordHandle as string])
  );

  const reviewerLabel = (wallet: string | null | undefined): string => {
    if (!wallet) return "-";
    return walletToDiscord.get(wallet.toLowerCase()) ?? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  };

  const filteredSubmissions = submissions.filter((s) => {
    const matchStatus = submissionStatusFilter === "all" || s.status === submissionStatusFilter;
    const q = submissionSearch.toLowerCase();
    const matchSearch = !q ||
      s.taskId?.toLowerCase().includes(q) ||
      s.taskTitle?.toLowerCase().includes(q) ||
      s.walletAddress?.toLowerCase().includes(q) ||
      s.discordHandle?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.walletAddress?.toLowerCase().includes(q) ||
      u.discordHandle?.toLowerCase().includes(q)
    );
  });

  const taskSubmissionCounts = submissions.reduce((acc, s) => {
    acc[s.taskId] = (acc[s.taskId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const csvEsc = (v: any) => {
    const str = String(v ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const downloadCsv = (rows: any[][], name: string) => {
    const csv = rows.map((r) => r.map(csvEsc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // Private full detail for the High Council multi-sig hand-off, mirroring the
  // Admin Tracker sheet schema. One row per payable winner (approved + on a
  // completed task). RBNT is the payout currency; USD is reference.
  const exportAdminTracker = () => {
    const rows: any[][] = [[
      "Task ID", "Task Title", "Category", "Cycle", "Ledger Status", "Contributor", "Contributor Discord",
      "Contributor Email", "Contributor Wallet", "Reviewer", "Reviewer Wallet", "Rubric /35", "Revision Count",
      "Contributor Reward ($)", "Contributor RBNT", "Reviewer Comp ($)", "Reviewer RBNT", "USDT Amount",
      "Payment Split", "Payment TX Hash", "Deliverable Link", "Public Note",
    ]];
    payableWinners.forEach((s) => {
      const task = tasks.find((t) => t.id === s.taskId);
      const led = ledgerDocs[s.taskId] || {};
      const contributor = users.find((u) => u.walletAddress?.toLowerCase() === s.walletAddress?.toLowerCase());
      const reviewerRbnt = task?.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : "";
      rows.push([
        s.taskId, s.taskTitle, task?.category ?? "", s.cycle ?? "", getLedgerStatusLabel(deriveLedgerStatus(task as Task, subsForTask(s.taskId))),
        displayName(s.username, s.discordHandle, s.walletAddress), s.discordHandle ?? "", contributor?.email ?? "", s.walletAddress ?? "",
        s.reviewerName ?? "", s.reviewerWallet ?? "", s.reviewTotalScore ?? "", s.revisionCount ?? 0,
        task?.reward ?? "", task?.rewardRbnt ?? "", task?.reviewerComp ?? "", reviewerRbnt, led.usdtAmount ?? "",
        task?.paymentSplit ?? "", led.paidTxHash ?? "", led.deliverableLink || (s ? deliverableLinkOf(s) : ""), led.publicNote ?? "",
      ]);
    });
    downloadCsv(rows, "admin-tracker");
  };

  // Community-safe public ledger, mirroring the public Transparency Ledger sheet:
  // no identities, just task, status, RBNT payout (with USD), deliverable link.
  const exportPublicLedger = () => {
    const rows: any[][] = [["Task ID", "Current Status", "RBNT Payout", "USD Payout", "Deliverable Link"]];
    [...ledgerTasks].sort((a, b) => (a.number || 0) - (b.number || 0)).forEach((t) => {
      const led = ledgerDocs[t.id] || {};
      const status = led.statusOverride || deriveLedgerStatus(t, subsForTask(t.id));
      rows.push([t.id, getLedgerStatusLabel(status), led.payoutRbnt ?? t.rewardRbnt ?? "", led.payoutUsd ?? t.reward ?? "", led.deliverableLink ?? ""]);
    });
    downloadCsv(rows, "public-ledger");
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
    { label: "Pending Payment", value: payableWinners.length },
    { label: "Active Tasks", value: tasks.filter((t) => t.status === "open").length },
    { label: "Total Users", value: users.length },
  ];

  const TABS: { value: AdminTab; label: string }[] = [
    { value: "submissions", label: "Submissions" },
    { value: "tasks", label: "Tasks" },
    { value: "users", label: "Users" },
    { value: "payments", label: "Ledger" },
    { value: "reviewers", label: "Reviewers" },
    { value: "audit", label: "Audit Log" },
    { value: "feedback", label: "Feedback" },
  ];

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A2E]">Admin Dashboard</h1>
            <p className="text-[#888888] text-sm mt-1">Full task board management and oversight.</p>
          </div>
          <button
            onClick={refreshData}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
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
        <div className="flex gap-1 mb-6 bg-white border border-[#E8EBF0] rounded-lg p-1 w-fit shadow-sm flex-wrap">
          {TABS.map((t) => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.value ? "bg-[#E63329] text-white shadow-sm" : "text-[#888888] hover:text-[#1A1A2E]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* SUBMISSIONS TAB */}
        {tab === "submissions" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
              <p className="text-white font-semibold text-sm">
                All Submissions ({filteredSubmissions.length}{filteredSubmissions.length !== submissions.length ? `/${submissions.length}` : ""})
              </p>
            </div>
            <div className="px-4 py-3 border-b border-[#E8EBF0] flex gap-3 flex-wrap items-center bg-white">
              <input
                className="input text-xs flex-1 min-w-[200px]"
                placeholder="Search task ID, title, wallet, or Discord..."
                value={submissionSearch}
                onChange={(e) => setSubmissionSearch(e.target.value)}
              />
              <select
                className="text-xs border border-[#E8EBF0] rounded-lg px-3 py-2 bg-white text-[#1A1A2E] focus:outline-none focus:border-[#E63329]"
                value={submissionStatusFilter}
                onChange={(e) => setSubmissionStatusFilter(e.target.value)}
              >
                {SUB_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</option>
                ))}
              </select>
              {(submissionSearch || submissionStatusFilter !== "all") && (
                <button
                  onClick={() => { setSubmissionSearch(""); setSubmissionStatusFilter("all"); }}
                  className="text-xs text-[#AAAAAA] hover:text-[#1A1A2E] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                    <th className="text-left px-4 py-3 font-semibold">Task</th>
                    <th className="text-left px-4 py-3 font-semibold">Contributor</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Reviewer</th>
                    <th className="text-left px-4 py-3 font-semibold">Score</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Links</th>
                    <th className="text-left px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((sub, i) => (
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
                          <span className={`badge-${sub.status}`}>{getSubmissionStatusLabel(sub.status)}</span>
                          {sub.adminOverride && <span className="badge bg-yellow-50 text-yellow-700">overridden</span>}
                          {sub.paymentProcessed && <span className="badge bg-green-50 text-green-700">paid</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {sub.reviewingByWallet ? (
                          <button
                            onClick={() => { setTab("reviewers"); setSelectedReviewer(sub.reviewingByWallet); }}
                            className="text-amber-600 font-semibold hover:underline text-left"
                          >
                            {reviewerLabel(sub.reviewingByWallet)}
                            <span className="block text-[10px] font-normal text-amber-500">active now</span>
                          </button>
                        ) : sub.reviewerWallet ? (
                          <button
                            onClick={() => { setTab("reviewers"); setSelectedReviewer(sub.reviewerWallet); }}
                            className="text-[#888888] hover:text-[#E63329] hover:underline text-left"
                          >
                            {reviewerLabel(sub.reviewerWallet)}
                          </button>
                        ) : (
                          <span className="text-[#AAAAAA]">-</span>
                        )}
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
                          <button
                            onClick={() => { setOverrideSub(sub); setOverrideDecision(""); setOverrideFeedback(""); }}
                            className="text-xs text-[#888888] font-semibold hover:text-[#E63329] transition-colors text-left"
                          >
                            Override
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSubmissions.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">
                      {submissions.length === 0 ? "No submissions yet." : "No submissions match your filter."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TASKS TAB */}
        {tab === "tasks" && (
          <div>
            {/* Board-wide maintenance pause */}
            <div className={`rounded-xl p-4 mb-6 border ${boardPaused ? "bg-[#FEF0EF] border-[#E63329]/30" : "bg-white border-[#E8EBF0]"}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className={`text-sm font-semibold mb-1 ${boardPaused ? "text-[#E63329]" : "text-[#1A1A2E]"}`}>
                    {boardPaused ? "Board is paused" : "Board is live"}
                  </p>
                  <p className="text-xs text-[#555555] max-w-2xl">
                    {boardPaused
                      ? "Everyone except admins sees a maintenance screen instead of the board. The public ledger stays visible. You keep full access."
                      : "Pause the whole board for maintenance between cycles. The public ledger stays visible, and admins keep full access."}
                  </p>
                </div>
                <button
                  onClick={toggleBoardPause}
                  className={`text-xs px-4 py-2 rounded-lg font-semibold ${boardPaused ? "btn-primary" : "border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF]"}`}
                >
                  {boardPaused ? "Reopen board" : "Pause board"}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <input
                  value={pauseMessage}
                  onChange={(e) => setPauseMessage(e.target.value)}
                  onBlur={savePauseMessage}
                  placeholder="Optional message shown on the paused screen (defaults to a standard maintenance note)"
                  className="input text-xs flex-1 min-w-[240px]"
                />
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
                <p className="text-white font-semibold text-sm">All Tasks ({tasks.length})</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-white text-xs">
                    <span className="text-[#AAAAAA]" title="Submission cycle: bump this to reset everyone's per-cycle submission cap for fresh task batches.">Cycle</span>
                    <button onClick={() => bumpCycle(-1)} disabled={cycle == null || cycle <= 1} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed">−</button>
                    <span className="font-bold w-5 text-center">{cycle ?? "…"}</span>
                    <button onClick={() => bumpCycle(1)} disabled={cycle == null} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                  </div>
                  <button onClick={openAddTask} className="btn-primary text-xs px-3 py-1.5">+ Add Task</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                      <th className="text-left px-4 py-3 font-semibold">ID</th>
                      <th className="text-left px-4 py-3 font-semibold">Title</th>
                      <th className="text-left px-4 py-3 font-semibold">Category</th>
                      <th className="text-left px-4 py-3 font-semibold">Reward</th>
                      <th className="text-left px-4 py-3 font-semibold">Subs</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTasks.map((task, i) => (
                      <tr key={task.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"} ${task.status === "completed" ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1A2E]">{task.id}</td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-[#1A1A2E] max-w-[200px] truncate">{task.title}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-[#E63329]">{formatReward(task.rewardRbnt, task.reward)}</td>
                        <td className="px-4 py-3 text-xs">
                          {taskSubmissionCounts[task.id] ? (
                            <button
                              onClick={() => { setTab("submissions"); setSubmissionSearch(task.id); setSubmissionStatusFilter("all"); }}
                              className="font-bold text-[#E63329] hover:underline"
                            >
                              {taskSubmissionCounts[task.id]}
                            </button>
                          ) : (
                            <span className="text-[#AAAAAA]">0</span>
                          )}
                        </td>
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
                        <td colSpan={7} className="px-4 py-12 text-center">
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

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
              <p className="text-white font-semibold text-sm">
                All Users ({filteredUsers.length}{filteredUsers.length !== users.length ? `/${users.length}` : ""})
              </p>
              <p className="text-white/50 text-xs">Change roles via the dropdown</p>
            </div>
            <div className="px-4 py-3 border-b border-[#E8EBF0] bg-white flex flex-wrap gap-3 items-end">
              <input
                className="input text-xs w-full max-w-sm"
                placeholder="Search by wallet address or Discord handle..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />

              {/* Pre-grant role to unregistered wallet (add user feature) */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                const w = (e.currentTarget.wallet as any).value.trim().toLowerCase();
                if (!w.startsWith("0x")) return alert("Valid 0x wallet");
                const role = (e.currentTarget.role as any).value;
                const uname = (e.currentTarget.uname as any).value.trim();
                const dc = (e.currentTarget.dc as any).value.trim();
                // Pending pre-grant stored in its own collection so it never collides
                // with the users walletAddress migration query. Applied on next register/login.
                await setDoc(doc(db, "pendingGrants", w), {
                  walletAddress: w,
                  role,
                  username: uname || undefined,
                  discordHandle: dc || undefined,
                  reviewerCategories: role === "reviewer" ? ["developer"] : undefined, // default, admin can edit later
                  createdAt: serverTimestamp(),
                });
                alert("Pre-granted. User will get role on register.");
                (e.target as any).reset();
                await doFetchAll();
              }} className="flex gap-2 items-end text-xs">
                <input name="wallet" placeholder="0x wallet" className="input text-xs w-40" required />
                <select name="role" className="input text-xs">
                  <option value="contributor">contributor</option>
                  <option value="reviewer">reviewer</option>
                  <option value="admin">admin</option>
                </select>
                <input name="uname" placeholder="username" className="input text-xs w-28" />
                <input name="dc" placeholder="discord" className="input text-xs w-28" />
                <button type="submit" className="btn-primary text-xs px-3 py-1">Pre-grant Role</button>
              </form>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                    <th className="text-left px-4 py-3 font-semibold">Display Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Wallet Address</th>
                    <th className="text-left px-4 py-3 font-semibold">Discord</th>
                    <th className="text-left px-4 py-3 font-semibold">Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Joined</th>
                    <th className="text-left px-4 py-3 font-semibold">Change Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, i) => (
                    <tr key={u.id} className={`border-b border-[#F4F5F7] ${u.suspended ? "opacity-50" : i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                      <td className="px-4 py-3 text-xs font-semibold text-[#1A1A2E]">{u.username || <span className="text-[#AAAAAA] font-normal">-</span>}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#1A1A2E]">{u.walletAddress}</td>
                      <td className="px-4 py-3 text-xs text-[#888888]">{u.discordHandle || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`badge ${
                            u.role === "admin" ? "bg-[#FEF0EF] text-[#E63329]" :
                            u.role === "reviewer" ? "bg-blue-50 text-blue-700" :
                            "bg-[#F4F5F7] text-[#888888]"
                          }`}>{u.role}</span>
                          {u.suspended && <span className="badge bg-red-50 text-red-600">suspended</span>}
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
                              u.suspended ? "text-green-600 hover:text-green-800" : "text-red-500 hover:text-red-700"
                            }`}
                          >
                            {u.suspended ? "Unsuspend" : "Suspend"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">
                      {users.length === 0 ? "No users yet." : "No users match your search."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {tab === "payments" && (
          <div>
            <div className="bg-[#FEF0EF] border border-[#E63329]/20 rounded-xl p-4 mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-[#E63329] mb-1">Task Board Ledger</p>
                <p className="text-xs text-[#555555] max-w-2xl">
                  The single source of truth for task status, winners, and payouts. Edits here publish straight to the
                  public transparency ledger at <span className="font-mono">/ledger</span> (community-facing, no identities).
                  Only the highest-scoring approved submission on a <span className="font-semibold">Completed</span> task is payable.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={publishAllLedger} className="btn-secondary text-xs px-3 py-1.5">Sync public ledger</button>
                <button onClick={exportAdminTracker} className="btn-ghost text-xs px-3 py-1.5 border border-[#E8EBF0] rounded-lg">Admin Tracker CSV</button>
                <button onClick={exportPublicLedger} className="btn-ghost text-xs px-3 py-1.5 border border-[#E8EBF0] rounded-lg">Public Ledger CSV</button>
              </div>
            </div>

            {heldForCompletion.length > 0 && (
              <div className="bg-[#FEFCE8] border border-[#EAB308]/30 rounded-lg p-3 mb-4 text-xs text-[#854D0E]">
                {heldForCompletion.length} approved submission{heldForCompletion.length === 1 ? "" : "s"} held: their task is not marked Completed yet, so no winner is payable. Complete the task to release payment.
              </div>
            )}

            {tiedTasks.length > 0 && (
              <div className="card overflow-hidden mb-4 border border-[#EAB308]/40">
                <div className="px-4 py-3" style={{ backgroundColor: "#854D0E" }}>
                  <p className="text-white font-semibold text-sm">Ties to resolve ({tiedTasks.length})</p>
                </div>
                <div className="p-4 space-y-4">
                  {tiedTasks.map(({ taskId, subs }) => (
                    <div key={taskId}>
                      <p className="text-xs font-semibold text-[#1A1A2E] mb-2">
                        <span className="font-mono">{taskId}</span> has {subs.length} approved submissions tied at {scoreOf(subs[0])}/35. Pick the one to pay.
                      </p>
                      <div className="space-y-1.5">
                        {subs.map((sub) => (
                          <div key={sub.id} className="flex items-center justify-between gap-2 bg-[#F4F5F7] rounded px-3 py-2">
                            <span className="text-xs text-[#1A1A2E] truncate">
                              {displayName(sub.username, sub.discordHandle, sub.walletAddress)}
                              <span className="text-[#888888] font-mono ml-2">{sub.walletAddress?.slice(0, 6)}...{sub.walletAddress?.slice(-4)}</span>
                            </span>
                            <button onClick={() => choosePaymentWinner(taskId, sub.id)} className="btn-primary text-xs px-3 py-1 shrink-0">Pay this one</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card overflow-hidden mb-4">
              <div className="px-4 py-3" style={{ backgroundColor: "#2C2C2C" }}>
                <p className="text-white font-semibold text-sm">Ledger ({ledgerTasks.length} completed task{ledgerTasks.length === 1 ? "" : "s"})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                      <th className="text-left px-4 py-3 font-semibold">Task</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Winner</th>
                      <th className="text-left px-4 py-3 font-semibold">Rubric</th>
                      <th className="text-left px-4 py-3 font-semibold">Contributor Pay</th>
                      <th className="text-left px-4 py-3 font-semibold">Reviewer Pay</th>
                      <th className="text-left px-4 py-3 font-semibold">Deliverable Link</th>
                      <th className="text-left px-4 py-3 font-semibold">Payment TX</th>
                      <th className="text-left px-4 py-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerTasks.map((task, i) => {
                      const subs = subsForTask(task.id);
                      const { winner } = pickWinner(subs);
                      const led = ledgerDocs[task.id] || {};
                      const status = led.statusOverride || deriveLedgerStatus(task, subs);
                      const reviewerRbnt = task.rewardRbnt ? Math.round(task.rewardRbnt * 0.2) : undefined;
                      const expanded = expandedLedger === task.id;
                      const canPay = winner && task.status === "completed" && !winner.paymentProcessed;
                      return (
                        <Fragment key={task.id}>
                          <tr className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1A2E]">{task.id}{winner?.cycle != null && <span className="ml-1 text-[10px] text-[#AAAAAA]">c{winner.cycle}</span>}</td>
                            <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${LEDGER_STATUS_COLOR[status] || "bg-[#F4F5F7] text-[#555555]"}`}>{getLedgerStatusLabel(status)}</span></td>
                            <td className="px-4 py-3 text-xs text-[#1A1A2E]">{winner ? <span title={winner.walletAddress}>{displayName(winner.username, winner.discordHandle, winner.walletAddress)}</span> : <span className="text-[#AAAAAA]">-</span>}</td>
                            <td className="px-4 py-3 text-xs">{winner?.reviewTotalScore != null ? <span className="font-bold text-[#E63329]">{winner.reviewTotalScore}/35</span> : <span className="text-[#AAAAAA]">-</span>}</td>
                            <td className="px-4 py-3 text-xs font-semibold text-[#1A1A2E]">{formatReward(task.rewardRbnt, task.reward)}</td>
                            <td className="px-4 py-3 text-xs text-[#888888]">{task.reviewerComp ? formatReward(reviewerRbnt, task.reviewerComp) : "N/A"}</td>
                            <td className="px-4 py-3">
                              <input
                                defaultValue={led.deliverableLink || (winner ? deliverableLinkOf(winner) : "")}
                                onBlur={(e) => { if (e.target.value !== (led.deliverableLink || (winner ? deliverableLinkOf(winner) : ""))) saveLedgerField(task.id, "deliverableLink", e.target.value.trim()); }}
                                placeholder="deliverable URL"
                                className="w-40 text-xs border border-[#E8EBF0] rounded px-2 py-1 bg-white focus:outline-none focus:border-[#E63329]"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                defaultValue={led.paidTxHash || ""}
                                onBlur={(e) => { if (e.target.value !== (led.paidTxHash || "")) saveLedgerField(task.id, "paidTxHash", e.target.value.trim()); }}
                                placeholder="0x..."
                                className="w-32 text-xs font-mono border border-[#E8EBF0] rounded px-2 py-1 bg-white focus:outline-none focus:border-[#E63329]"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {canPay && <button onClick={() => setPayConfirmId(winner.id)} className="text-xs text-green-600 font-semibold hover:text-green-800 mr-3">Mark Paid</button>}
                              {winner?.paymentProcessed && <span className="text-xs text-green-600 font-semibold mr-3">Paid ✓</span>}
                              <button onClick={() => setExpandedLedger(expanded ? null : task.id)} className="text-xs text-[#888888] hover:text-[#E63329]">{expanded ? "Close" : "Edit"}</button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-[#FBFBFC] border-b border-[#E8EBF0]">
                              <td colSpan={9} className="px-4 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                  <label className="text-xs text-[#555555]">Status override
                                    <select defaultValue={led.statusOverride || ""} onChange={(e) => saveLedgerField(task.id, "statusOverride", e.target.value)} className="mt-1 w-full text-xs border border-[#E8EBF0] rounded px-2 py-1 bg-white">
                                      <option value="">Auto ({getLedgerStatusLabel(deriveLedgerStatus(task, subs))})</option>
                                      {LEDGER_STATUSES.map((s) => <option key={s} value={s}>{getLedgerStatusLabel(s)}</option>)}
                                    </select>
                                  </label>
                                  <label className="text-xs text-[#555555]">USDT amount
                                    <input defaultValue={led.usdtAmount || ""} onBlur={(e) => saveLedgerField(task.id, "usdtAmount", e.target.value.trim())} className="mt-1 w-full text-xs border border-[#E8EBF0] rounded px-2 py-1 bg-white" />
                                  </label>
                                  <label className="text-xs text-[#555555]">Assigned date
                                    <input type="date" defaultValue={led.assignedDate || ""} onBlur={(e) => saveLedgerField(task.id, "assignedDate", e.target.value)} className="mt-1 w-full text-xs border border-[#E8EBF0] rounded px-2 py-1 bg-white" />
                                  </label>
                                  <label className="text-xs text-[#555555]">Due date
                                    <input type="date" defaultValue={led.dueDate || ""} onBlur={(e) => saveLedgerField(task.id, "dueDate", e.target.value)} className="mt-1 w-full text-xs border border-[#E8EBF0] rounded px-2 py-1 bg-white" />
                                  </label>
                                </div>
                                <label className="text-xs text-[#555555] block mb-3">Public note (shown on the community ledger)
                                  <input defaultValue={led.publicNote || ""} onBlur={(e) => saveLedgerField(task.id, "publicNote", e.target.value)} placeholder="e.g. paid in batch 2" className="mt-1 w-full text-xs border border-[#E8EBF0] rounded px-2 py-1 bg-white" />
                                </label>
                                <p className="text-[10px] uppercase tracking-wide text-[#AAAAAA] mb-1">Submissions ({subs.length})</p>
                                <div className="space-y-1">
                                  {subs.length === 0 && <p className="text-xs text-[#AAAAAA]">None yet.</p>}
                                  {subs.map((s) => (
                                    <div key={s.id} className="flex items-center gap-3 text-xs text-[#555555]">
                                      <span className="w-40 truncate">{displayName(s.username, s.discordHandle, s.walletAddress)}</span>
                                      <span className={`badge-${s.status} text-[10px]`}>{getSubmissionStatusLabel(s.status)}</span>
                                      <span>{s.reviewTotalScore != null ? `${s.reviewTotalScore}/35` : "unscored"}</span>
                                      {s.id === winner?.id && <span className="text-green-600 font-semibold">winner</span>}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {ledgerTasks.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">No completed tasks yet. Mark a task Completed (Tasks tab or the review page) to add it to the ledger.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {payableWinners.length > 0 && (
              <div className="card p-4 mb-6">
                <p className="text-xs font-semibold text-[#888888] mb-3 uppercase tracking-wide">Batch Summary</p>
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-[#AAAAAA]">Total Contributor Pay</p>
                    <p className="text-xl font-bold text-[#E63329]">
                      {payableWinners.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.rewardRbnt || 0), 0).toLocaleString()} RBNT
                    </p>
                    <p className="text-xs text-[#888888]">~${payableWinners.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.reward || 0), 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#AAAAAA]">Total Reviewer Pay</p>
                    <p className="text-xl font-bold text-[#1A1A2E]">
                      {payableWinners.reduce((sum, s) => sum + Math.round((tasks.find((t) => t.id === s.taskId)?.rewardRbnt || 0) * 0.2), 0).toLocaleString()} RBNT
                    </p>
                    <p className="text-xs text-[#888888]">~${payableWinners.reduce((sum, s) => sum + (tasks.find((t) => t.id === s.taskId)?.reviewerComp || 0), 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {paidSubmissions.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-4 py-3" style={{ backgroundColor: "#2C2C2C" }}>
                  <p className="text-white font-semibold text-sm">Payment History ({paidSubmissions.length})</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                        <th className="text-left px-4 py-3 font-semibold">Task</th>
                        <th className="text-left px-4 py-3 font-semibold">Contributor Wallet</th>
                        <th className="text-left px-4 py-3 font-semibold">Amount</th>
                        <th className="text-left px-4 py-3 font-semibold">Paid At</th>
                        <th className="text-left px-4 py-3 font-semibold">Marked By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidSubmissions.map((sub, i) => {
                        const task = tasks.find((t) => t.id === sub.taskId);
                        return (
                          <tr key={sub.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1A2E]">{sub.taskId}</td>
                            <td className="px-4 py-3 font-mono text-xs text-[#888888]">{sub.walletAddress?.slice(0, 8)}...{sub.walletAddress?.slice(-4)}</td>
                            <td className="px-4 py-3 text-xs font-bold text-green-600">{task ? formatReward(task.rewardRbnt, task.reward) : "-"}</td>
                            <td className="px-4 py-3 text-xs text-[#888888]">{sub.paymentProcessedAt?.toDate?.()?.toLocaleDateString() ?? "-"}</td>
                            <td className="px-4 py-3 font-mono text-xs text-[#AAAAAA]">
                              {sub.paymentProcessedByWallet
                                ? `${sub.paymentProcessedByWallet.slice(0, 6)}...${sub.paymentProcessedByWallet.slice(-4)}`
                                : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* REVIEWERS TAB */}
        {tab === "reviewers" && (
          <div className="space-y-6">
            {/* Currently Active Reviews */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#2C2C2C" }}>
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${activeReviews.length > 0 ? "bg-green-400 animate-pulse" : "bg-[#555555]"}`} />
                <p className="text-white font-semibold text-sm">Currently Reviewing ({activeReviews.length}) <span className="text-white/50 text-xs">(admins can force-release stale locks)</span></p>
              </div>
              {activeReviews.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#AAAAAA]">No active reviews right now.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                        <th className="text-left px-4 py-3 font-semibold">Reviewer Wallet</th>
                        <th className="text-left px-4 py-3 font-semibold">Task</th>
                        <th className="text-left px-4 py-3 font-semibold">Submitted By</th>
                        <th className="text-left px-4 py-3 font-semibold">Submission Date</th>
                        <th className="text-left px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeReviews.map((sub, i) => (
                        <tr key={sub.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                              <span className="text-xs font-semibold text-amber-700">
                                {reviewerLabel(sub.reviewingByWallet)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-semibold text-[#1A1A2E]">{sub.taskId}</p>
                            <p className="text-xs text-[#888888] truncate max-w-[160px]">{sub.taskTitle}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[#888888]">
                            {sub.walletAddress?.slice(0, 6)}...{sub.walletAddress?.slice(-4)}
                            {sub.discordHandle && <p className="text-[#AAAAAA]">{sub.discordHandle}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#888888]">
                            {sub.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                          </td>
                          <td className="px-4 py-3 flex items-center gap-2">
                            <button
                              onClick={() => setAuditSub(sub)}
                              className="text-xs text-[#E63329] font-semibold hover:underline"
                            >
                              View
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await updateDoc(doc(db, "submissions", sub.id), {
                                    reviewingBy: null,
                                    reviewingByWallet: null,
                                  });
                                  // Optimistically clear in local state so the list updates immediately
                                  setSubmissions((prev) =>
                                    prev.map((s) =>
                                      s.id === sub.id
                                        ? { ...s, reviewingBy: null, reviewingByWallet: null }
                                        : s
                                    )
                                  );
                                } catch {
                                  alert("Failed to release lock");
                                }
                              }}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Force release
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reviewer Stats */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3" style={{ backgroundColor: "#2C2C2C" }}>
                <p className="text-white font-semibold text-sm">All Reviewers ({reviewerStats.length})</p>
                <p className="text-white/50 text-xs mt-0.5">Click a row to inspect all their reviews</p>
              </div>
              {reviewerStats.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#AAAAAA]">No completed reviews yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                        <th className="text-left px-4 py-3 font-semibold">Reviewer Wallet</th>
                        <th className="text-left px-4 py-3 font-semibold">Total</th>
                        <th className="text-left px-4 py-3 font-semibold">Approved</th>
                        <th className="text-left px-4 py-3 font-semibold">Revision</th>
                        <th className="text-left px-4 py-3 font-semibold">Rejected</th>
                        <th className="text-left px-4 py-3 font-semibold">Avg Score</th>
                        <th className="text-left px-4 py-3 font-semibold">Last Review</th>
                        <th className="text-left px-4 py-3 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewerStats.map((r, i) => (
                        <tr
                          key={r.wallet}
                          className={`border-b border-[#F4F5F7] cursor-pointer transition-colors ${
                            selectedReviewer === r.wallet
                              ? "bg-[#FEF0EF]"
                              : i % 2 === 1 ? "bg-[#F4F5F7] hover:bg-[#FEF0EF]" : "bg-white hover:bg-[#FEF0EF]"
                          }`}
                          onClick={() => {
                            setSelectedReviewer(selectedReviewer === r.wallet ? null : r.wallet);
                            setExpandedReviewSub(null);
                          }}
                        >
                          <td className="px-4 py-3 text-xs font-semibold text-[#1A1A2E]">
                            {reviewerLabel(r.wallet)}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-[#1A1A2E]">{r.total}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-green-600">{r.approved}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-yellow-600">{r.revision}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-red-500">{r.rejected}</td>
                          <td className="px-4 py-3 text-xs">
                            {r.avgScore !== null
                              ? <span className="font-bold text-[#E63329]">{r.avgScore}/35</span>
                              : <span className="text-[#AAAAAA]">-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#888888]">
                            {r.lastReviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#E63329]">
                            {selectedReviewer === r.wallet ? "▲ Close" : "▼ Inspect"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Reviewer Detail Panel (inline expansion) */}
            {selectedReviewer && (
              <div className="card overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
                  <div>
                    <p className="text-white font-semibold text-sm">
                      Reviewer: <span>{reviewerLabel(selectedReviewer)}</span>
                    </p>
                    <p className="text-white/50 text-xs mt-0.5">{selectedReviewerSubs.length} review{selectedReviewerSubs.length !== 1 ? "s" : ""} completed</p>
                  </div>
                  <button onClick={() => { setSelectedReviewer(null); setExpandedReviewSub(null); }} className="text-white/50 hover:text-white text-xl leading-none">×</button>
                </div>

                <div className="divide-y divide-[#E8EBF0]">
                  {selectedReviewerSubs.map((sub) => {
                    const isExpanded = expandedReviewSub === sub.id;
                    return (
                      <div key={sub.id}>
                        {/* Summary row */}
                        <div
                          className={`px-4 py-4 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? "bg-[#FEF0EF]" : "bg-white hover:bg-[#F4F5F7]"}`}
                          onClick={() => setExpandedReviewSub(isExpanded ? null : sub.id)}
                        >
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="font-mono text-xs font-semibold text-[#1A1A2E]">{sub.taskId}</p>
                              <p className="text-xs text-[#888888] truncate max-w-[200px]">{sub.taskTitle}</p>
                            </div>
                            <span className={`badge-${sub.status}`}>{getSubmissionStatusLabel(sub.status)}</span>
                            {sub.adminOverride && <span className="badge bg-yellow-50 text-yellow-700">overridden</span>}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              {sub.reviewTotalScore ? (
                                <p className="text-sm font-bold text-[#E63329]">{sub.reviewTotalScore}/35</p>
                              ) : (
                                <p className="text-xs text-[#AAAAAA]">no score</p>
                              )}
                              <p className="text-[10px] text-[#AAAAAA]">{sub.reviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOverrideSub(sub); setOverrideDecision(""); setOverrideFeedback(""); }}
                              className="text-xs px-2 py-0.5 rounded border border-[#E63329] text-[#E63329] hover:bg-[#FEF0EF] font-semibold"
                            >
                              Override
                            </button>
                            <span className="text-xs text-[#AAAAAA] cursor-pointer">{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="bg-[#F4F5F7] px-5 py-5 space-y-6">
                            {/* Contributor */}
                            <div className="text-xs space-y-1">
                              <p className="font-semibold text-[#888888] uppercase tracking-wider mb-2">Contributor</p>
                              <p><span className="text-[#AAAAAA]">Wallet: </span><span className="font-mono text-[#1A1A2E]">{sub.walletAddress}</span></p>
                              {sub.discordHandle && <p><span className="text-[#AAAAAA]">Discord: </span><span className="text-[#1A1A2E]">{sub.discordHandle}</span></p>}
                              <div className="flex gap-3 pt-1">
                                {sub.githubLink && <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className="text-[#E63329] font-semibold hover:underline">GitHub →</a>}
                                {sub.liveLink && <a href={sub.liveLink} target="_blank" rel="noopener noreferrer" className="text-[#E63329] font-semibold hover:underline">Live →</a>}
                                {sub.fileUrl && <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[#E63329] font-semibold hover:underline">File →</a>}
                              </div>
                            </div>

                            {/* Rubric scores */}
                            {sub.reviewScores?.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-[#888888] uppercase tracking-wider mb-3">Review Rubric</p>
                                <div className="space-y-2">
                                  {RUBRIC_CRITERIA.map((criterion, ci) => (
                                    <div key={ci} className="bg-white rounded-lg p-3 border border-[#E8EBF0]">
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-semibold text-[#1A1A2E]">{criterion}</p>
                                        <div className="flex items-center gap-1">
                                          {[1, 2, 3, 4, 5].map((s) => (
                                            <div key={s} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                                              sub.reviewScores[ci] === s ? "bg-[#E63329] text-white" : "bg-[#F4F5F7] text-[#AAAAAA]"
                                            }`}>{s}</div>
                                          ))}
                                        </div>
                                      </div>
                                      {sub.reviewJustifications?.[ci] && (
                                        <p className="text-xs text-[#555555] italic">{sub.reviewJustifications[ci]}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Required changes */}
                            {sub.requiredChanges && (
                              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
                                <p className="font-semibold text-yellow-800 mb-1">Required Changes</p>
                                <p className="text-yellow-700 whitespace-pre-line">{sub.requiredChanges}</p>
                                {sub.revisionDeadline && <p className="text-yellow-600 mt-1">Deadline: {sub.revisionDeadline}</p>}
                              </div>
                            )}

                            {/* Admin override */}
                            {sub.adminOverride && (
                              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
                                <p className="font-semibold text-yellow-800 mb-1">Admin Override Applied</p>
                                <p className="text-[#AAAAAA] mb-0.5">By: <span className="font-mono text-[#555555]">{sub.adminOverrideWallet}</span></p>
                                <p className="text-yellow-700">{sub.adminOverrideFeedback}</p>
                              </div>
                            )}

                            {/* Chat */}
                            <div className="bg-white rounded-lg p-4 border border-[#E8EBF0]">
                              <p className="text-xs font-semibold text-[#888888] uppercase tracking-wider mb-3">Submission Chat</p>
                              <SubmissionChat
                                submissionId={sub.id}
                                taskId={sub.taskId}
                                taskTitle={sub.taskTitle}
                                contributorId={sub.contributorId}
                                reviewerId={sub.reviewerId}
                              />
                            </div>

                            {/* Admin override action */}
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); setOverrideSub(sub); setOverrideDecision(""); setOverrideFeedback(""); }}
                                className="btn-secondary text-xs"
                              >
                                Override Decision
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setAuditSub(sub); }}
                                className="btn-secondary text-xs"
                              >
                                Full Audit View
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AUDIT LOG TAB */}
        {tab === "audit" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
              <p className="text-white font-semibold text-sm">Admin Audit Log</p>
              <button
                onClick={refreshAuditLog}
                className="text-xs text-white/70 hover:text-white font-semibold transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
            {auditLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                      <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
                      <th className="text-left px-4 py-3 font-semibold">Action</th>
                      <th className="text-left px-4 py-3 font-semibold">Admin</th>
                      <th className="text-left px-4 py-3 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, i) => (
                      <tr key={log.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                        <td className="px-4 py-3 text-xs text-[#888888] whitespace-nowrap">
                          {log.timestamp?.toDate?.()?.toLocaleString() ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge text-xs ${
                            log.action === "admin_override" ? "bg-yellow-50 text-yellow-700" :
                            log.action === "payment_marked_paid" ? "bg-green-50 text-green-700" :
                            log.action === "user_suspended" || log.action === "task_deleted" ? "bg-red-50 text-red-600" :
                            log.action === "user_unsuspended" ? "bg-green-50 text-green-700" :
                            "bg-[#F4F5F7] text-[#555555]"
                          }`}>
                            {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[#888888]">
                          {log.adminWallet
                            ? `${log.adminWallet.slice(0, 6)}...${log.adminWallet.slice(-4)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#555555]">
                          {log.action === "admin_override" && (
                            <div>
                              <span className="font-mono font-semibold">{log.taskId}</span>
                              {" "}&rarr;{" "}
                              <span className={log.decision === "approved" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                                {log.decision}
                              </span>
                              {log.previousStatus && (
                                <span className="text-[#AAAAAA]"> (was: {log.previousStatus.replace(/_/g, " ")})</span>
                              )}
                              {log.feedback && (
                                <p className="text-[#888888] mt-0.5 italic truncate max-w-[280px]">"{log.feedback}"</p>
                              )}
                            </div>
                          )}
                          {log.action === "role_change" && (
                            <span>
                              {log.oldRole} &rarr; <span className="font-semibold text-[#1A1A2E]">{log.newRole}</span>
                              <span className="text-[#AAAAAA] ml-1">(uid: {log.userId?.slice(0, 8)})</span>
                            </span>
                          )}
                          {(log.action === "user_suspended" || log.action === "user_unsuspended") && (
                            <span className="font-mono">
                              {log.userWallet
                                ? `${log.userWallet.slice(0, 8)}...${log.userWallet.slice(-4)}`
                                : log.userId?.slice(0, 8)}
                            </span>
                          )}
                          {log.action === "payment_marked_paid" && (
                            <span>
                              <span className="font-mono font-semibold">{log.taskId}</span>
                              {" for "}
                              <span className="font-mono">
                                {log.contributorWallet
                                  ? `${log.contributorWallet.slice(0, 6)}...${log.contributorWallet.slice(-4)}`
                                  : "-"}
                              </span>
                            </span>
                          )}
                          {log.action === "task_deleted" && (
                            <span>
                              <span className="font-mono font-semibold">{log.taskId}</span>
                              {log.taskTitle && <span className="text-[#AAAAAA]"> ({log.taskTitle})</span>}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">
                          No audit log entries yet. Actions will appear here as you use the admin panel.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FEEDBACK TAB */}
        {tab === "feedback" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#2C2C2C" }}>
              <p className="text-white font-semibold text-sm">Community Feedback ({feedbackItems.length})</p>
              <button
                onClick={refreshFeedback}
                className="text-xs text-white/70 hover:text-white font-semibold transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
            {feedbackLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F5F7] text-xs text-[#888888] border-b border-[#E8EBF0]">
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Message</th>
                      <th className="text-left px-4 py-3 font-semibold">From</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackItems.map((f, i) => (
                      <tr key={f.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                        <td className="px-4 py-3 text-xs text-[#888888] whitespace-nowrap align-top">
                          {f.createdAt?.toDate?.()?.toLocaleString() ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`badge text-xs ${
                            f.type === "bug" ? "bg-red-50 text-red-600" :
                            f.type === "suggestion" ? "bg-blue-50 text-blue-700" :
                            "bg-[#F4F5F7] text-[#555555]"
                          }`}>
                            {f.type || "other"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#555555] align-top">
                          <p className="whitespace-pre-wrap max-w-[520px]">{f.message}</p>
                        </td>
                        <td className="px-4 py-3 text-xs align-top whitespace-nowrap">
                          {f.username && <p className="text-[#1A1A2E] font-semibold">{f.username}</p>}
                          <p className="font-mono text-[#888888]">
                            {f.from ? `${f.from.slice(0, 6)}...${f.from.slice(-4)}` : "-"}
                          </p>
                        </td>
                      </tr>
                    ))}
                    {feedbackItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">
                          No feedback yet. Submissions from the navbar Feedback button will appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TASK FORM PANEL */}
      {taskFormOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setTaskFormOpen(false)} />
          <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8EBF0] flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#2C2C2C" }}>
              <div>
                <h2 className="font-bold text-white">
                  {taskFormMode === "add" ? "Add New Task" : `Edit ${formTaskId}`}
                </h2>
                <p className="text-white/50 text-xs mt-0.5">All fields will be visible to contributors</p>
              </div>
              <button onClick={() => setTaskFormOpen(false)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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

              <div>
                <label className="label">Title <span className="text-[#E63329]">*</span></label>
                <input className="input" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Task title" />
              </div>

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
                <div>
                  <label className="label">Max Submissions Cap (default 5)</label>
                  <input type="number" min="1" className="input" value={formMaxSubs} onChange={(e) => setFormMaxSubs(e.target.value)} />
                  <p className="text-[10px] text-[#AAAAAA]">Visible to admins/reviewers only</p>
                </div>
              </div>

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
                  {rbntPriceError && <p className="text-xs text-red-500">{rbntPriceError}</p>}
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

              <div>
                <label className="label">Short Description</label>
                <textarea className="input resize-none" rows={2} value={formShortDesc}
                  onChange={(e) => setFormShortDesc(e.target.value)} placeholder="1-2 sentence summary shown on the task card" />
              </div>

              <div>
                <label className="label">Problem Statement</label>
                <textarea className="input resize-none" rows={3} value={formProblem}
                  onChange={(e) => setFormProblem(e.target.value)} placeholder="Why does this task exist? What problem does it solve?" />
              </div>

              <ListEditor label="Technical Requirements" items={formTechnicalReqs} setItems={setFormTechnicalReqs} placeholder="Requirement" />
              <ListEditor label="Required Deliverables" items={formDeliverables} setItems={setFormDeliverables} placeholder="Deliverable" />
              <ListEditor label="Quality Benchmarks" items={formBenchmarks} setItems={setFormBenchmarks} placeholder="Benchmark" />
              <ListEditor label="Failure Criteria" items={formFailure} setItems={setFormFailure} placeholder="Criterion" />
              <ListEditor label="Infrastructure / Resources" items={formInfrastructure} setItems={setFormInfrastructure} placeholder="Resource name or URL" />
            </div>

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

      {/* DELETE CONFIRMATION */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-bold text-[#1A1A2E] mb-1">Delete Task?</h3>
            <p className="text-sm text-[#888888] mb-5">
              Permanently delete <span className="font-mono font-semibold text-[#1A1A2E]">{deleteConfirmId}</span>?
              This cannot be undone and will be logged to the audit trail.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteTask(deleteConfirmId)} className="btn-primary" style={{ backgroundColor: "#DC2626" }}>
                Delete
              </button>
              <button onClick={() => setDeleteConfirmId(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* MARK AS PAID CONFIRMATION */}
      {payConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-bold text-[#1A1A2E] mb-1">Confirm Payment</h3>
            <p className="text-sm text-[#888888] mb-1">
              Mark submission for <span className="font-mono font-semibold text-[#1A1A2E]">{submissions.find((s) => s.id === payConfirmId)?.taskId}</span> as paid?
            </p>
            <p className="text-xs text-[#AAAAAA] mb-5">This is logged to the audit trail and cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => markAsPaid(payConfirmId)}
                disabled={markingPaid}
                className="btn-primary flex items-center gap-2"
                style={{ backgroundColor: "#16a34a" }}
              >
                {markingPaid ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Marking...</>
                ) : "Confirm Paid"}
              </button>
              <button onClick={() => setPayConfirmId(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT PANEL (submission detail) */}
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
                      <span className={`badge-${auditSub.status}`}>{getSubmissionStatusLabel(auditSub.status)}</span>
                    </div>
                    <div className="bg-[#F4F5F7] rounded-lg p-3">
                      <p className="text-xs text-[#AAAAAA] mb-1">Reviewed</p>
                      <p className="text-xs text-[#555555]">{auditSub.reviewedAt?.toDate?.()?.toLocaleDateString() ?? "-"}</p>
                    </div>
                  </div>
                  <div className="text-xs mb-3">
                    <span className="text-[#AAAAAA]">Reviewer: </span>
                    <span className="font-semibold text-[#555555]">{reviewerLabel(auditSub.reviewerWallet)}</span>
                    {walletToDiscord.has(auditSub.reviewerWallet?.toLowerCase()) && (
                      <span className="text-[#AAAAAA] font-mono ml-1">({auditSub.reviewerWallet?.slice(0, 6)}...{auditSub.reviewerWallet?.slice(-4)})</span>
                    )}
                  </div>

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

              <SubmissionChat
                submissionId={auditSub.id}
                taskId={auditSub.taskId}
                taskTitle={auditSub.taskTitle}
                contributorId={auditSub.contributorId}
                reviewerId={auditSub.reviewerId}
              />
            </div>
          </div>
        </div>
      )}

      {/* OVERRIDE MODAL */}
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
                  <span className={`badge-${overrideSub.status}`}>{getSubmissionStatusLabel(overrideSub.status)}</span>
                </div>
              </div>

              {overrideSub.reviewerWallet && (
                <div className="text-xs">
                  <span className="text-[#AAAAAA]">Reviewed by: </span>
                  <span className="font-semibold text-[#555555]">{reviewerLabel(overrideSub.reviewerWallet)}</span>
                  {walletToDiscord.has(overrideSub.reviewerWallet?.toLowerCase()) && (
                    <span className="text-[#AAAAAA] font-mono ml-1">({overrideSub.reviewerWallet?.slice(0, 6)}...{overrideSub.reviewerWallet?.slice(-4)})</span>
                  )}
                </div>
              )}

              <div className="bg-[#FEF0EF] rounded-lg p-3 text-xs text-[#555555]">
                <span className="font-semibold text-[#E63329]">Warning: </span>
                This overrides the current status and affects payment eligibility. All overrides are logged to the audit trail.
              </div>

              <div>
                <p className="label mb-3">New Decision</p>
                <div className="flex gap-3 flex-wrap">
                  {(["approved", "under_review", "rejected"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setOverrideDecision(d)}
                      className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${
                        overrideDecision === d
                          ? d === "approved" ? "bg-green-600 text-white"
                          : d === "under_review" ? "bg-blue-600 text-white"
                          : "bg-red-600 text-white"
                          : "bg-white border border-[#E8EBF0] text-[#555555] hover:border-[#555555]"
                      }`}
                    >
                      {d === "under_review" ? "Return to Review" : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
                {overrideDecision === "under_review" && (
                  <p className="text-xs text-blue-600 mt-2">This will clear the existing review scores and return the submission to the open review queue.</p>
                )}
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

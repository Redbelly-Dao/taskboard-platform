"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDocs, getDoc, doc, updateDoc, setDoc, deleteDoc, addDoc,
  query, orderBy, serverTimestamp, onSnapshot,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { Task, TaskCategory, displayName } from "@/lib/tasks";
import { publishReviewerDirectory } from "@/lib/reviewer-directory";
import { ledgerProjection, deriveLedgerStatus, getLedgerStatusLabel, deliverableLinkOf } from "@/lib/ledger";
import { notifyAppealDecided } from "@/lib/notifications";
import { Appeal } from "@/lib/appeals";
import { refundNotSelectedCaps } from "@/lib/submissions";

export type AdminTabValue = "submissions" | "tasks" | "users" | "ledger" | "reviewers" | "audit" | "feedback" | "suggestions" | "appeals";

export const TASK_CATEGORIES: TaskCategory[] = ["developer", "design", "research", "documentation", "content"];
export const SUB_STATUS_OPTIONS = ["all", "under_review", "approved", "rejected", "revision_requested", "withdrawn"] as const;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  admin_override: "Submission Override",
  role_change: "Role Changed",
  user_suspended: "User Suspended",
  user_unsuspended: "User Unsuspended",
  payment_marked_paid: "Payment Marked Paid",
  payment_winner_selected: "Payment Winner Selected",
  task_deleted: "Task Deleted",
  appeal_decided: "Appeal Decided",
};

// Dot colours for ledger statuses (dot + mono chip, no filled pill).
export const LEDGER_STATUS_DOT: Record<string, string> = {
  open: "bg-outline",
  in_progress: "bg-warn",
  in_review: "bg-tertiary",
  revision: "bg-warn",
  approved: "bg-ok",
  awaiting_payment: "bg-primary",
  paid: "bg-ok",
  paused: "bg-outline",
  rejected: "bg-error",
};

export const RUBRIC_CRITERIA = [
  "Deliverable completeness",
  "Quality Benchmarks met",
  "Technical accuracy",
  "Documentation quality",
  "Test coverage / verification",
  "Failure Criteria avoided",
  "Overall standard",
];

// Array fields are typed `any[]` (not `any`) so `.map`/`.filter` callbacks in the tab pages avoid implicit-any errors.
// Everything else falls through the index signature as `any`.
/* eslint-disable @typescript-eslint/no-explicit-any */
interface AdminCtxValue {
  submissions: any[]; users: any[]; tasks: any[];
  auditLogs: any[]; feedbackItems: any[]; suggestionItems: any[];
  displayTasks: any[]; ledgerTasks: any[]; payableWinners: any[]; tiedTasks: any[];
  heldForCompletion: any[]; paidSubmissions: any[]; activeReviews: any[];
  reviewerStats: any[]; selectedReviewerSubs: any[];
  filteredSubmissions: any[]; filteredUsers: any[]; stats: any[];
  appeals: any[]; openAppeals: any[]; decidedAppeals: any[];
  formDeliverables: string[]; formBenchmarks: string[]; formFailure: string[];
  formTechnicalReqs: string[]; formInfrastructure: string[];
  [key: string]: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const AdminCtx = createContext<AdminCtxValue | null>(null);
export const useAdmin = (): AdminCtxValue => {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
};

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ledgerDocs, setLedgerDocs] = useState<Record<string, any>>({});
  const [expandedLedger, setExpandedLedger] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const [auditSub, setAuditSub] = useState<any>(null);

  const [overrideSub, setOverrideSub] = useState<any>(null);
  const [overrideDecision, setOverrideDecision] = useState<"approved" | "rejected" | "under_review" | "">("");
  const [overrideFeedback, setOverrideFeedback] = useState("");
  const [overriding, setOverriding] = useState(false);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [feedbackItems, setFeedbackItems] = useState<any[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [resolvingFeedbackId, setResolvingFeedbackId] = useState<string | null>(null);

  const [suggestionItems, setSuggestionItems] = useState<any[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const [appeals, setAppeals] = useState<any[]>([]);
  const [appealNotes, setAppealNotes] = useState<Record<string, string>>({});

  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string>("all");
  const [submissionCycleFilter, setSubmissionCycleFilter] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");

  const [payConfirmId, setPayConfirmId] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  const [selectedReviewer, setSelectedReviewer] = useState<string | null>(null);
  const [expandedReviewSub, setExpandedReviewSub] = useState<string | null>(null);

  const [rbntPrice, setRbntPrice] = useState<number | null>(null);
  const [rbntPriceLoading, setRbntPriceLoading] = useState(false);
  const [rbntPriceError, setRbntPriceError] = useState("");

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
  const [formMaxSubs, setFormMaxSubs] = useState("5");
  const [formReviewerId, setFormReviewerId] = useState(""); // assigned reviewer uid (B2)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, appUser]);

  // Appeals (rulebook 09): live, so a newly filed appeal shows up and blocks payment without a manual refresh.
  useEffect(() => {
    if (!user || appUser?.role !== "admin") return;
    const unsub = onSnapshot(query(collection(db, "appeals"), orderBy("createdAt", "desc")), (snap) => {
      setAppeals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, appUser]);

  const openAppeals = appeals.filter((a) => a.status === "open");
  const decidedAppeals = appeals.filter((a) => a.status !== "open");
  // Cheap set for payment gating: a task with any submission under open appeal has its payout held (rulebook 09).
  const openAppealTaskIds = new Set(openAppeals.map((a) => a.taskId));

  const setAppealNote = (appealId: string, note: string) =>
    setAppealNotes((prev) => ({ ...prev, [appealId]: note }));

  // Uphold: decision stands, nothing else changes.
  // Overturn requires a High Council co-signer name;
  // for a rejection appeal it also reinstates the submission (the admin picks "approved" or "under_review").
  // A winner-selection overturn makes no automatic submission write, admin uses the existing payment tools.
  const decideAppeal = async (
    appeal: Appeal,
    outcome: "upheld" | "overturned",
    opts: { cosignedBy?: string; reinstateAs?: "approved" | "under_review" } = {}
  ) => {
    if (outcome === "overturned" && !opts.cosignedBy?.trim()) return;
    const note = (appealNotes[appeal.id] ?? "").trim();
    const patch: Record<string, unknown> = {
      status: outcome,
      adminNote: note || null,
      decidedAt: serverTimestamp(),
      decidedBy: user?.uid,
      decidedByWallet: appUser?.walletAddress,
    };
    if (outcome === "overturned") patch.cosignedBy = opts.cosignedBy!.trim();
    await updateDoc(doc(db, "appeals", appeal.id), patch);

    if (outcome === "overturned" && appeal.type === "rejection" && opts.reinstateAs) {
      await updateDoc(doc(db, "submissions", appeal.submissionId), {
        status: opts.reinstateAs,
        updatedAt: serverTimestamp(),
      });
      setSubmissions((prev) => prev.map((s) => s.id === appeal.submissionId ? { ...s, status: opts.reinstateAs } : s));
    }

    await logAdminAction("appeal_decided", {
      appealId: appeal.id,
      submissionId: appeal.submissionId,
      taskId: appeal.taskId,
      outcome,
      cosignedBy: opts.cosignedBy ?? null,
    });

    await notifyAppealDecided({
      submissionId: appeal.submissionId,
      taskId: appeal.taskId,
      taskTitle: appeal.taskTitle,
      contributorId: appeal.contributorId,
      adminWallet: appUser?.walletAddress,
      outcome,
    });
  };

  const [cycleConfig, setCycleConfig] = useState<Record<string, any>>({ current: 1 });
  const cycle = cycleConfig.current ?? 1;
  useEffect(() => {
    if (!user || appUser?.role !== "admin") return;
    getDoc(doc(db, "config", "cycle")).then((snap) => {
      setCycleConfig(snap.exists() ? { current: 1, ...snap.data() } : { current: 1 });
    });
  }, [user, appUser]);

  const bumpCycle = async (delta: number) => {
    const next = Math.max(1, (cycle ?? 1) + delta);
    setCycleConfig((c) => ({ ...c, current: next }));
    await setDoc(doc(db, "config", "cycle"), { current: next }, { merge: true });
  };

  // Edit the cycle dates (B1): open / freeze / close / pay / last revision due.
  const saveCycleDates = async (dates: { openAt?: string; freezeAt?: string; closeAt?: string; payAt?: string; lastRevisionAt?: string }) => {
    setCycleConfig((c) => ({ ...c, ...dates }));
    await setDoc(doc(db, "config", "cycle"), dates, { merge: true });
  };

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

  const displayTasks = useMemo(
    () => [...tasks].sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed")),
    [tasks]
  );

  const refreshData = async () => {
    setDataLoading(true);
    await doFetchAll();
  };

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

  // Server route does the actual work (auth + UTApi deletion); this just calls it and patches local state.
  const resolveFeedback = async (feedbackId: string) => {
    if (!user) return;
    setResolvingFeedbackId(feedbackId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/feedback/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feedbackId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve");

      setFeedbackItems((prev) => prev.map((f) => {
        if (f.id !== feedbackId) return f;
        const purgedAttachments = (f.attachments || []).map((a: any) => ({ name: a.name, size: a.size }));
        return {
          ...f,
          status: "resolved",
          resolvedAt: new Date(),
          attachments: undefined,
          purgedAttachments,
          purgedAttachmentCount: data.purgedAttachmentCount ?? purgedAttachments.length,
        };
      }));
    } catch {
      // row just stays unresolved; admin can retry
    } finally {
      setResolvingFeedbackId(null);
    }
  };

  const refreshSuggestions = () => {
    setSuggestionLoading(true);
    getDocs(query(collection(db, "taskSuggestions"), orderBy("createdAt", "desc")))
      .then((snap) => {
        setSuggestionItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSuggestionLoading(false);
      })
      .catch(() => setSuggestionLoading(false));
  };

  const updateSuggestionStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "taskSuggestions", id), { status }).catch(() => {});
    setSuggestionItems((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
  };

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
      const activeCount = submissions.filter((s) => {
        if (s.taskId !== overrideSub.taskId) return false;
        const effective = s.id === overrideSub.id ? newStatus : s.status;
        return effective !== "rejected" && effective !== "withdrawn";
      }).length;
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

  // Pre-grant a role to an unregistered wallet; applied on next register/login.
  const preGrantRole = async (payload: { wallet: string; role: string; username?: string; discordHandle?: string }) => {
    const w = payload.wallet.trim().toLowerCase();
    if (!w.startsWith("0x")) { alert("Valid 0x wallet"); return false; }
    await setDoc(doc(db, "pendingGrants", w), {
      walletAddress: w,
      role: payload.role,
      username: payload.username || undefined,
      discordHandle: payload.discordHandle || undefined,
      reviewerCategories: payload.role === "reviewer" ? ["developer"] : undefined,
      createdAt: serverTimestamp(),
    });
    await doFetchAll();
    return true;
  };

  // Admin force-releases a stale review lock (reviewer walked away).
  const forceReleaseLock = async (subId: string) => {
    try {
      await updateDoc(doc(db, "submissions", subId), { reviewingBy: null, reviewingByWallet: null });
      setSubmissions((prev) => prev.map((s) => s.id === subId ? { ...s, reviewingBy: null, reviewingByWallet: null } : s));
    } catch {
      alert("Failed to release lock");
    }
  };

  const subsForTask = (taskId: string) => submissions.filter((s) => s.taskId === taskId);

  const publishLedger = async (taskId: string, subsOverride?: any[], taskOverride?: Task) => {
    const task = taskOverride ?? tasks.find((t) => t.id === taskId);
    if (!task) return;
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

  const saveLedgerField = async (taskId: string, field: string, value: string) => {
    await setDoc(doc(db, "ledger", taskId), { [field]: value, taskId, updatedAt: serverTimestamp() }, { merge: true });
    setLedgerDocs((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), [field]: value } }));
  };

  const publishAllLedger = async () => {
    for (const t of tasks) await publishLedger(t.id);
    alert("Public ledger synced for all tasks.");
  };

  const choosePaymentWinner = async (taskId: string, subId: string) => {
    const group = submissions.filter((s) => s.taskId === taskId && s.status === "approved" && !s.paymentProcessed);
    await Promise.all(group.map((s) => updateDoc(doc(db, "submissions", s.id), { paymentWinner: s.id === subId })));
    const nextSubs = submissions.map((s) => group.some((g) => g.id === s.id) ? { ...s, paymentWinner: s.id === subId } : s);
    setSubmissions(nextSubs);
    await logAdminAction("payment_winner_selected", { taskId, submissionId: subId });
    await publishLedger(taskId, nextSubs.filter((s) => s.taskId === taskId));
  };

  const markAsPaid = async (subId: string) => {
    const sub = submissions.find((s) => s.id === subId);
    // Payment hold (rulebook 09): an open appeal on this task blocks payout, even via a path other than the gated UI.
    if (sub?.taskId && openAppealTaskIds.has(sub.taskId)) {
      alert("This task has an open appeal. Resolve it in the Appeals tab before marking payment.");
      return;
    }
    setMarkingPaid(true);
    try {
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
    const current = tasks.find((t) => t.id === taskId);
    // Stamp once, the first time a task reaches Completed;
    // the winner-selection appeal window (rulebook 09) keys off this and must not reset on later status changes.
    const stampCompleted = newStatus === "completed" && !current?.completedAt;
    await updateDoc(doc(db, "tasks", taskId), {
      status: newStatus,
      ...(stampCompleted ? { completedAt: serverTimestamp() } : {}),
    });
    const nextTasks = tasks.map((t) => t.id === taskId
      ? { ...t, status: newStatus, ...(stampCompleted ? { completedAt: { seconds: Date.now() / 1000 } } : {}) }
      : t);
    setTasks(nextTasks);
    await publishLedger(taskId, subsForTask(taskId), nextTasks.find((t) => t.id === taskId));
    // Rulebook s03: not-selected shortlisted submissions get their cap slot back once the task is completed.
    // capRefunded makes this a no-op the second time a task is un-completed and re-completed.
    if (newStatus === "completed") {
      const refundedIds = await refundNotSelectedCaps(subsForTask(taskId));
      if (refundedIds.length) setSubmissions((prev) => prev.map((s) => refundedIds.includes(s.id) ? { ...s, capRefunded: true } : s));
    }
  };

  const openAddTask = () => {
    const nextNum = tasks.length > 0 ? Math.max(...tasks.map((t) => t.number || 0)) + 1 : 1;
    setTaskFormMode("add");
    setFormTaskId(`TASK-${nextNum.toString().padStart(2, "0")}`);
    setFormTitle(""); setFormCategory("developer"); setFormReward(""); setFormRewardRbnt("");
    setFormPaymentSplit("100% RBNT"); setFormStatus("open"); setFormShortDesc(""); setFormProblem("");
    setFormDeliverables([""]); setFormBenchmarks([""]); setFormFailure([""]);
    setFormTechnicalReqs([""]); setFormInfrastructure([""]); setFormMaxSubs("5"); setFormReviewerId(""); setFormError("");
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
    setFormReviewerId(task.reviewerId ?? "");
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
        ...(() => {
          // Per-task reviewer assignment (B2). Store uid + wallet + name so the reviewer queue and conflict checks never need to read the users doc.
          const r = users.find((u) => u.id === formReviewerId);
          return {
            reviewerId: formReviewerId || null,
            reviewerWallet: r?.walletAddress ?? null,
            reviewerName: r ? displayName(r.username, r.discordHandle, r.walletAddress) : null,
          };
        })(),
      };

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

  // Payment gating: task must be Completed, only the top approved submission is payable.
  const completedTaskIds = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
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
      const chosen = top.find((s) => s.paymentWinner);
      if (chosen) payableWinners.push(chosen);
      else tiedTasks.push({ taskId, subs: top });
    }
  });

  const heldForCompletion = submissions.filter(
    (s) => s.status === "approved" && !s.paymentProcessed && !completedTaskIds.has(s.taskId)
  );
  const paidSubmissions = submissions.filter((s) => s.status === "approved" && s.paymentProcessed);

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

  // Users who can be assigned as a task's reviewer (B2). Admins can review too.
  const reviewers = users.filter((u) => u.role === "reviewer" || u.role === "admin");

  // Publish a rules-safe reviewer directory so reviewers can populate the reassignment dropdown without reading users.
  useEffect(() => {
    if (appUser?.role !== "admin" || users.length === 0) return;
    publishReviewerDirectory(
      reviewers.map((u) => ({
        uid: u.id,
        wallet: u.walletAddress ?? null,
        name: displayName(u.username, u.discordHandle, u.walletAddress),
        categories: u.reviewerCategories ?? [],
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, appUser]);

  const submissionCyclesPresent = Array.from(
    new Set(submissions.map((s) => s.cycle).filter((c) => typeof c === "number"))
  ).sort((a, b) => b - a);

  const filteredSubmissions = submissions.filter((s) => {
    const matchStatus = submissionStatusFilter === "all" || s.status === submissionStatusFilter;
    const matchCycle = submissionCycleFilter === "all" || String(s.cycle ?? "") === submissionCycleFilter;
    const q = submissionSearch.toLowerCase();
    const matchSearch = !q ||
      s.taskId?.toLowerCase().includes(q) ||
      s.taskTitle?.toLowerCase().includes(q) ||
      s.walletAddress?.toLowerCase().includes(q) ||
      s.discordHandle?.toLowerCase().includes(q);
    return matchStatus && matchCycle && matchSearch;
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

  const exportPublicLedger = () => {
    const rows: any[][] = [["Task ID", "Current Status", "RBNT Payout", "USD Payout", "Deliverable Link"]];
    [...ledgerTasks].sort((a, b) => (a.number || 0) - (b.number || 0)).forEach((t) => {
      const led = ledgerDocs[t.id] || {};
      const status = led.statusOverride || deriveLedgerStatus(t, subsForTask(t.id));
      rows.push([t.id, getLedgerStatusLabel(status), led.payoutRbnt ?? t.rewardRbnt ?? "", led.payoutUsd ?? t.reward ?? "", led.deliverableLink ?? ""]);
    });
    downloadCsv(rows, "public-ledger");
  };

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

  // Cross-tab navigation helpers (state persists since the provider lives in the admin layout, above per-tab pages).
  const goToReviewer = (wallet: string) => { setSelectedReviewer(wallet); router.push("/admin/reviewers"); };
  const goToTaskSubmissions = (taskId: string) => {
    setSubmissionSearch(taskId); setSubmissionStatusFilter("all"); router.push("/admin/submissions");
  };

  const value = {
    loading, dataLoading, router,
    submissions, setSubmissions, users, setUsers, tasks, setTasks,
    ledgerDocs, expandedLedger, setExpandedLedger,
    auditSub, setAuditSub,
    overrideSub, setOverrideSub, overrideDecision, setOverrideDecision, overrideFeedback, setOverrideFeedback, overriding,
    auditLogs, auditLoading, feedbackItems, feedbackLoading, resolvingFeedbackId, resolveFeedback,
    suggestionItems, suggestionLoading, refreshSuggestions, updateSuggestionStatus,
    appeals, openAppeals, decidedAppeals, openAppealTaskIds, appealNotes, setAppealNote, decideAppeal,
    submissionSearch, setSubmissionSearch, submissionStatusFilter, setSubmissionStatusFilter,
    submissionCycleFilter, setSubmissionCycleFilter, submissionCyclesPresent,
    userSearch, setUserSearch,
    payConfirmId, setPayConfirmId, markingPaid,
    selectedReviewer, setSelectedReviewer, expandedReviewSub, setExpandedReviewSub,
    rbntPrice, rbntPriceLoading, rbntPriceError, fetchRbntPrice, toRbnt,
    // task form
    taskFormOpen, setTaskFormOpen, taskFormMode, formTaskId, setFormTaskId, formTitle, setFormTitle,
    formCategory, setFormCategory, formReward, setFormReward, formRewardRbnt, setFormRewardRbnt,
    formPaymentSplit, setFormPaymentSplit, formStatus, setFormStatus, formShortDesc, setFormShortDesc,
    formProblem, setFormProblem, formDeliverables, setFormDeliverables, formBenchmarks, setFormBenchmarks,
    formFailure, setFormFailure, formTechnicalReqs, setFormTechnicalReqs, formInfrastructure, setFormInfrastructure,
    formMaxSubs, setFormMaxSubs, formReviewerId, setFormReviewerId, reviewers, formSaving, formError, deleteConfirmId, setDeleteConfirmId,
    reviewerCompRbntDisplay, reviewerCompUsdDisplay,
    // cycle + pause
    cycle, cycleConfig, bumpCycle, saveCycleDates, boardPaused, pauseMessage, setPauseMessage, toggleBoardPause, savePauseMessage,
    // handlers
    doFetchAll, refreshData, refreshAuditLog, refreshFeedback, logAdminAction,
    updateRole, suspendUser, applyAdminOverride, forceReleaseLock, preGrantRole, subsForTask, publishLedger, saveLedgerField,
    publishAllLedger, choosePaymentWinner, markAsPaid, updateTaskStatus, openAddTask, openEditTask,
    saveTask, deleteTask, exportAdminTracker, exportPublicLedger,
    // derived
    displayTasks, ledgerTasks, scoreOf, payableWinners, tiedTasks, heldForCompletion, paidSubmissions,
    activeReviews, reviewerStats, selectedReviewerSubs, walletToDiscord, reviewerLabel,
    filteredSubmissions, filteredUsers, taskSubmissionCounts, stats,
    goToReviewer, goToTaskSubmissions,
  };

  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}

// Small inline list editor used by the task form.
export function ListEditor({
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
              <button type="button" onClick={() => remove(i)} className="text-outline hover:text-error px-2 text-lg transition-colors">×</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-2 text-xs text-primary font-semibold hover:underline">
        + Add item
      </button>
    </div>
  );
}

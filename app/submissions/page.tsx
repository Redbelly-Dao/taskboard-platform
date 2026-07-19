"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import AppShell, { PageHeader } from "@/components/AppShell";
import DataTable, { Column } from "@/components/ui/DataTable";
import { getSubmissionStatusLabel, displayName } from "@/lib/tasks";
import Link from "next/link";

export default function SubmissionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [filterCycle, setFilterCycle] = useState<string>("all");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "submissions"), where("contributorId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setSubmissions(sorted);
      setSubLoading(false);
    });
    return () => unsub();
  }, [user]);

  if (loading || subLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background-deep">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const cyclesPresent = Array.from(
    new Set(submissions.map((s) => s.cycle).filter((c: unknown): c is number => typeof c === "number"))
  ).sort((a, b) => b - a);
  const visible = filterCycle === "all" ? submissions : submissions.filter((s) => String(s.cycle ?? "") === filterCycle);

  const columns: Column<any>[] = [
    {
      key: "task",
      header: "Task",
      cell: (s) => (
        <div>
          <p className="mono text-xs font-semibold text-on-surface">
            {s.taskId}{typeof s.cycle === "number" && <span className="text-outline font-normal"> · c{s.cycle}</span>}
          </p>
          <p className="text-xs text-outline truncate max-w-[220px]">{s.taskTitle}</p>
        </div>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (s) => <span className="mono text-xs text-outline">{s.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <div className="flex flex-col items-end md:items-start gap-1">
          <span className={`badge-${s.status}`}>{getSubmissionStatusLabel(s.status, s.revisionCount)}</span>
          {s.adminOverride && <span className="mono text-[10px] text-warn">admin reviewed</span>}
        </div>
      ),
    },
    {
      key: "score",
      header: "Score",
      cell: (s) => s.reviewTotalScore
        ? <span className="mono font-semibold text-primary">{s.reviewTotalScore}/35</span>
        : <span className="text-outline">-</span>,
    },
    {
      key: "reviewer",
      header: "Reviewed by",
      cell: (s) => <span className="text-xs text-outline">{s.reviewerWallet ? displayName(s.reviewerName, undefined, s.reviewerWallet) : "-"}</span>,
    },
    {
      key: "links",
      header: "Links",
      cell: (s) => (
        <div className="flex gap-2 flex-wrap justify-end md:justify-start">
          {s.githubLink && <a href={s.githubLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-semibold hover:underline">GitHub</a>}
          {s.liveLink && <a href={s.liveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-semibold hover:underline">Live</a>}
          {s.fileUrl && <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-semibold hover:underline">File</a>}
          {!s.githubLink && !s.liveLink && !s.fileUrl && <span className="text-outline text-xs">-</span>}
        </div>
      ),
    },
    {
      key: "view",
      header: "",
      hideOnMobile: true,
      cell: (s) => (
        <Link href={`/tasks/${s.taskId}`} className="text-xs text-primary font-semibold hover:underline whitespace-nowrap">
          View →
        </Link>
      ),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="My Submissions"
        subtitle={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""} total`}
      />

      {submissions.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-outline text-sm mb-3">You have not submitted any work yet.</p>
          <Link href="/dashboard" className="text-primary text-sm font-semibold hover:underline">
            Browse open tasks →
          </Link>
        </div>
      ) : (
        <>
          {cyclesPresent.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-outline">Cycle</span>
              <select className="input text-xs w-auto" value={filterCycle} onChange={(e) => setFilterCycle(e.target.value)}>
                <option value="all">All cycles</option>
                {cyclesPresent.map((c) => <option key={c} value={String(c)}>Cycle {c}</option>)}
              </select>
            </div>
          )}
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(s) => s.id}
            onRowClick={(s) => router.push(`/tasks/${s.taskId}`)}
          />
        </>
      )}
    </AppShell>
  );
}

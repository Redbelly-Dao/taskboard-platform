"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import AppShell, { PageHeader } from "@/components/AppShell";
import DataTable, { Column } from "@/components/ui/DataTable";
import { getSubmissionStatusLabel, displayName } from "@/lib/tasks";
import { deletionBlockedReason, DELETION_REASON_MAX, getDeletionStatusLabel } from "@/lib/deletion-requests";
import Modal from "@/components/ui/Modal";
import RightsSignature from "@/components/RightsSignature";
import type { RightsRecord } from "@/lib/rights";
import Link from "next/link";

export default function SubmissionsPage() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [filterCycle, setFilterCycle] = useState<string>("all");
  // T&Cs cl 4.4. Keyed by submission id so the button can show state per row.
  const [deletionRequests, setDeletionRequests] = useState<Record<string, any>>({});
  const [openAppealIds, setOpenAppealIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [signTarget, setSignTarget] = useState<any>(null);

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

  useEffect(() => {
    if (!user) return;
    const unsubDel = onSnapshot(
      query(collection(db, "deletionRequests"), where("contributorId", "==", user.uid)),
      (snap) => {
        const map: Record<string, any> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
        setDeletionRequests(map);
      },
      () => setDeletionRequests({}),
    );
    // An open appeal blocks deletion until it is decided, so the button needs to know about them.
    const unsubAppeals = onSnapshot(
      query(collection(db, "appeals"), where("contributorId", "==", user.uid)),
      (snap) => setOpenAppealIds(new Set(snap.docs.filter((d) => d.data().status === "open").map((d) => d.id))),
      () => setOpenAppealIds(new Set()),
    );
    return () => { unsubDel(); unsubAppeals(); };
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
      key: "rights",
      header: "Your copy",
      cell: (s) => {
        // Paid before the signing step existed, so there is no agreement behind it. Needs action, not a dash.
        if (s.paymentProcessed && !s.rightsSignature) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setSignTarget(s); }}
              className="text-xs text-brand hover:underline font-semibold whitespace-nowrap"
            >
              Sign rights agreement
            </button>
          );
        }
        const req = deletionRequests[s.id];
        if (req) {
          return (
            <span className={`text-xs ${req.status === "declined" ? "text-warn" : "text-outline"}`}>
              {req.status === "open" ? "Deletion requested" : getDeletionStatusLabel(req.status)}
            </span>
          );
        }
        const blocked = deletionBlockedReason(s, openAppealIds.has(s.id));
        if (blocked) return <span className="text-xs text-outline">-</span>;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
            className="text-xs text-outline hover:text-error font-semibold whitespace-nowrap"
          >
            Request deletion
          </button>
        );
      },
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

      {signTarget && (
        <Cycle1SignModal
          sub={signTarget}
          wallet={appUser?.walletAddress ?? null}
          defaultCreditName={appUser?.username || appUser?.discordHandle || ""}
          onClose={() => setSignTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeletionRequestModal
          sub={deleteTarget}
          wallet={appUser?.walletAddress ?? null}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </AppShell>
  );
}

// Cycle 1 backfill. Writes the agreement onto the existing submission rather than creating anything new,
// because the submission is the record the assignment attaches to. Rules allow this exactly once per
// submission and only while no signature is present, so a signed record can never be overwritten from here.
function Cycle1SignModal({
  sub, wallet, defaultCreditName, onClose,
}: { sub: any; wallet: string | null; defaultCreditName: string; onClose: () => void }) {
  const [record, setRecord] = useState<RightsRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const save = async (r: RightsRecord) => {
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "submissions", sub.id), {
        rightsVersion: r.rightsVersion,
        rightsMessage: r.rightsMessage,
        rightsSignature: r.rightsSignature,
        rightsSignedAt: r.rightsSignedAt,
        rightsWallet: r.rightsWallet,
        creditName: r.creditName,
        updatedAt: serverTimestamp(),
      });
      setDone(true);
    } catch {
      setError("Signed, but saving it failed. Nothing was recorded. Check your connection and try again.");
      setRecord(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Sign rights agreement">
      {done ? (
        <div className="py-2">
          <p className="text-sm text-ok font-semibold mb-1">Recorded. Thank you.</p>
          <p className="text-xs text-outline leading-relaxed">
            The agreement is now on the record for <span className="mono">{sub.taskId}</span>. Nothing about your
            payment changes.
          </p>
          <div className="flex justify-end mt-4">
            <button onClick={onClose} className="btn-primary text-xs">Close</button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-on-surface mb-3">
            <span className="mono text-xs">{sub.taskId}</span> {sub.taskTitle}
          </p>
          {wallet ? (
            <RightsSignature
              cycle1
              taskId={sub.taskId}
              wallet={wallet}
              defaultCreditName={defaultCreditName}
              value={record}
              onChange={(r) => { setRecord(r); if (r) save(r); }}
            />
          ) : (
            <p className="text-xs text-error">No wallet on your profile. Sign out and back in with your wallet first.</p>
          )}
          {busy && <p className="text-xs text-outline mt-2">Recording…</p>}
          {error && <p className="text-xs text-error mt-2">{error}</p>}
          <div className="flex justify-end mt-4">
            <button onClick={onClose} className="btn-secondary text-xs">Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// T&Cs cl 4.4. Files the request; an admin does the deleting.
// Deliberately blunt about what is and is not removed, because the one thing worse than not offering this
// is letting someone believe their work vanished from the internet when the deliverable link is public.
function DeletionRequestModal({ sub, wallet, onClose }: { sub: any; wallet: string | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(db, "deletionRequests", sub.id), {
        submissionId: sub.id,
        contributorId: sub.contributorId,
        walletAddress: wallet,
        taskId: sub.taskId ?? null,
        taskTitle: sub.taskTitle ?? null,
        reason: reason.trim() || null,
        status: "open",
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch {
      setError("Could not file the request. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Request deletion">
      <p className="text-sm text-on-surface mb-3">
        <span className="mono text-xs">{sub.taskId}</span> {sub.taskTitle}
      </p>
      <p className="text-xs text-outline leading-relaxed mb-4">
        Your submission was not selected, so no rights transferred and the work is yours. Asking for deletion
        removes it and any uploaded file from the board. An admin actions it, usually within a cycle. What stays
        is the fact that a submission was made and its rubric scores, because appeals and the audit log point at
        them. Nothing you submitted is published either way.
      </p>

      <label className="label" htmlFor="deletion-reason">Reason (optional)</label>
      <textarea
        id="deletion-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={DELETION_REASON_MAX}
        className="input resize-none"
        placeholder="Not required. Helpful if something specific prompted this."
      />
      <p className="text-xs text-outline mt-1">{reason.length}/{DELETION_REASON_MAX}</p>

      {error && <p className="text-xs text-error mt-2">{error}</p>}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
        <button onClick={submit} disabled={busy} className="btn-primary text-xs">
          {busy ? "Filing…" : "Request deletion"}
        </button>
      </div>
    </Modal>
  );
}

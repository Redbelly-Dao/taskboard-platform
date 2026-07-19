"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Navbar from "@/components/Navbar";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { getLedgerStatusLabel } from "@/lib/ledger";

// Status is a dot plus a monospaced label, never a colour-filled pill.
const STATUS_DOT: Record<string, string> = {
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

const rbntLine = (rbnt?: number | null, usd?: number | null) => {
  if (rbnt && usd) return `${Number(rbnt).toLocaleString()} RBNT (~$${Number(usd).toLocaleString()})`;
  if (rbnt) return `${Number(rbnt).toLocaleString()} RBNT`;
  if (usd) return `$${Number(usd).toLocaleString()}`;
  return "-";
};

export default function PublicLedgerPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(collection(db, "ledger")).then((snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        // The ledger only shows completed tasks; guard against any stale entries.
        .filter((r) => r.taskStatus === "completed")
        .sort((a, b) => (a.taskNumber || 0) - (b.taskNumber || 0));
      setRows(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const totals = useMemo(() => ({
    rbnt: rows.reduce((s, r) => s + (Number(r.payoutRbnt) || 0), 0),
    usd: rows.reduce((s, r) => s + (Number(r.payoutUsd) || 0), 0),
  }), [rows]);

  return (
    <div className="min-h-screen bg-background-deep">
      {/* Signed-in users get the normal nav; signed-out visitors get a minimal public header with a sign-in affordance.
          The ledger itself is viewable either way. */}
      {user ? (
        <Navbar />
      ) : (
        <header className="page-header sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-outline text-sm font-medium">Task Board</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/login" className="btn-secondary text-xs">Sign in</Link>
            </div>
          </div>
        </header>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-semibold text-on-surface mb-1">Public Transparency Ledger</h1>
        <p className="text-sm text-outline mb-6 max-w-2xl leading-relaxed">
          A community-facing audit trail of every completed Redbelly DAO Community Task Board task: its status, the RBNT
          payout committed, and a link to the final deliverable. No contributor identities are shown.
        </p>

        {loading ? (
          <div className="card p-12 text-center text-sm text-outline">Loading ledger…</div>
        ) : rows.length === 0 ? (
          <div className="card p-12 text-center text-sm text-outline">The ledger has not been published yet. Check back soon.</div>
        ) : (
          <div className="card card-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="card-rule">
                    <th className="table-header text-left">Task</th>
                    <th className="table-header text-left">Status</th>
                    <th className="table-header text-left">RBNT payout</th>
                    <th className="table-header text-left">Deliverable</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 1 ? "row-alt" : ""}>
                      <td className="px-4 py-3">
                        <span className="mono text-xs font-semibold text-on-surface">{r.taskId}</span>
                        {r.title && <span className="block text-[11px] text-outline max-w-[240px] truncate mt-0.5">{r.title}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 mono text-[11px] text-on-surface whitespace-nowrap">
                          <span className={`w-1.5 h-1.5 rounded-full flex-none ${STATUS_DOT[r.status] || "bg-outline"}`} />
                          {getLedgerStatusLabel(r.status)}
                        </span>
                        {r.publicNote && <span className="block text-[10px] text-outline mt-1">{r.publicNote}</span>}
                      </td>
                      <td className="px-4 py-3 mono text-xs font-semibold text-on-surface whitespace-nowrap">{rbntLine(r.payoutRbnt, r.payoutUsd)}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.deliverableLink
                          ? <a href={r.deliverableLink} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">View →</a>
                          : <span className="text-outline">-</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-brand/40 bg-surface-container-lowest">
                    <td className="px-4 py-3 mono text-[11px] font-bold text-outline uppercase tracking-widest" colSpan={2}>Total committed</td>
                    <td className="px-4 py-3 mono text-sm font-bold text-primary whitespace-nowrap">{rbntLine(totals.rbnt, totals.usd)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-outline mt-6 leading-relaxed">
          RBNT is paid at market price on the day of disbursement via the DAO High Council multi-sig. Payouts shown are the
          amounts committed per task. Deliverables are published to the{" "}
          <a href="https://github.com/Redbelly-DAO-Community-Taskboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">community GitHub</a>.
        </p>
      </div>
    </div>
  );
}

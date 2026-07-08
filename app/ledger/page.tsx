"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Navbar from "@/components/Navbar";
import { getLedgerStatusLabel } from "@/lib/ledger";

// Themed pill colors, mirroring the admin ledger palette.
const STATUS_COLOR: Record<string, string> = {
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
    <div className="min-h-screen bg-[#F4F5F7]">
      {/* Signed-in users get the normal app nav; signed-out visitors get a
          minimal public header with a sign-in affordance. The ledger itself is
          viewable either way. */}
      {user ? (
        <Navbar />
      ) : (
        <header className="page-header">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Image src="/dao-logo.png" alt="Redbelly DAO" height={32} width={47} className="object-contain" />
              <span className="text-[#555555] text-sm font-medium">Task Board</span>
            </div>
            <Link href="/login" className="btn-ghost text-sm">Sign in</Link>
          </div>
        </header>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-1">Public Transparency Ledger</h1>
        <p className="text-sm text-[#555555] mb-6 max-w-2xl">
          A community-facing audit trail of every Redbelly DAO Community Task Board task: its current status, the RBNT
          payout committed, and a link to the final deliverable once complete. No contributor identities are shown.
        </p>

        {loading ? (
          <div className="card p-12 text-center text-sm text-[#AAAAAA]">Loading ledger...</div>
        ) : rows.length === 0 ? (
          <div className="card p-12 text-center text-sm text-[#AAAAAA]">The ledger has not been published yet. Check back soon.</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#888888] border-b border-[#E8EBF0]" style={{ backgroundColor: "#F4F5F7" }}>
                    <th className="text-left px-4 py-3 font-semibold">Task ID</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">RBNT Payout</th>
                    <th className="text-left px-4 py-3 font-semibold">Deliverable</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={`border-b border-[#F4F5F7] ${i % 2 === 1 ? "bg-[#F4F5F7]" : "bg-white"}`}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1A2E]">
                        {r.taskId}
                        {r.title && <span className="block text-[10px] text-[#AAAAAA] font-sans font-normal max-w-[220px] truncate">{r.title}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[r.status] || "bg-[#F4F5F7] text-[#555555]"}`}>{getLedgerStatusLabel(r.status)}</span>
                        {r.publicNote && <span className="block text-[10px] text-[#AAAAAA] mt-0.5">{r.publicNote}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#1A1A2E]">{rbntLine(r.payoutRbnt, r.payoutUsd)}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.deliverableLink
                          ? <a href={r.deliverableLink} target="_blank" rel="noopener noreferrer" className="text-[#E63329] font-semibold hover:underline break-all">View →</a>
                          : <span className="text-[#AAAAAA]">-</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#E8EBF0]" style={{ backgroundColor: "#2C2C2C" }}>
                    <td className="px-4 py-3 text-xs font-bold text-white" colSpan={2}>TOTAL COMMITTED</td>
                    <td className="px-4 py-3 text-xs font-bold text-white">{rbntLine(totals.rbnt, totals.usd)}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-[#AAAAAA] mt-6">
          RBNT is paid at market price on the day of disbursement via the DAO High Council multi-sig. Payouts shown are the
          amounts committed per task. Deliverables are published to the{" "}
          <a href="https://github.com/Redbelly-DAO-Community-Taskboard" target="_blank" rel="noopener noreferrer" className="text-[#E63329] hover:underline">community GitHub</a>.
        </p>
      </div>
    </div>
  );
}

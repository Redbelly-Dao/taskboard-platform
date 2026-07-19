"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import { AdminProvider, useAdmin } from "@/app/admin/AdminProvider";
import AdminModals from "@/app/admin/AdminModals";

const NAV = [
  { seg: "submissions", label: "Submissions" },
  { seg: "tasks", label: "Tasks" },
  { seg: "cycle", label: "Cycle" },
  { seg: "users", label: "Users" },
  { seg: "ledger", label: "Ledger" },
  { seg: "reviewers", label: "Reviewers" },
  { seg: "audit", label: "Audit Log" },
  { seg: "feedback", label: "Feedback" },
  { seg: "suggestions", label: "Task Suggestions" },
  { seg: "appeals", label: "Appeals" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminChrome>{children}</AdminChrome>
    </AdminProvider>
  );
}

function AdminChrome({ children }: { children: React.ReactNode }) {
  const { dataLoading, stats, refreshData } = useAdmin();
  const pathname = usePathname() || "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = NAV.find((n) => pathname.startsWith(`/admin/${n.seg}`))?.seg ?? "submissions";

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <Link
          key={n.seg}
          href={`/admin/${n.seg}`}
          onClick={onNavigate}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            active === n.seg
              ? "bg-brand text-white"
              : "text-on-surface hover:bg-surface-container-high"
          }`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background-deep">
      <Navbar />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">Admin</h1>
            <p className="text-outline text-sm mt-1">Full task board management and oversight.</p>
          </div>
          <button onClick={refreshData} className="btn-secondary text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {stats.map((s: { label: string; value: number }) => (
            <div key={s.label} className="card p-4">
              <p className="mono text-2xl font-semibold text-on-surface">{s.value}</p>
              <p className="text-xs text-outline mt-1 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Mobile tab trigger */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="md:hidden mb-4 w-full card px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-on-surface"
        >
          <span>{NAV.find((n) => n.seg === active)?.label}</span>
          <svg className="w-4 h-4 text-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-48 flex-none">
            <div className="sticky top-20">
              <NavList />
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {dataLoading ? (
              <div className="flex justify-center py-24">
                <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </div>

      {/* Mobile tab drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[110] flex">
          <button className="flex-1 bg-black/60" onClick={() => setDrawerOpen(false)} aria-label="Close menu" />
          <div className="glass w-64 max-w-[80vw] h-full p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="label mb-0">Admin sections</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close" className="text-on-surface hover:text-primary">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <AdminModals />
    </div>
  );
}

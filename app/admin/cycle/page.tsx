"use client";
import { useState } from "react";
import { useAdmin } from "@/app/admin/AdminProvider";
import { cyclePhase, countdownLabel, Cycle } from "@/lib/cycle";

export default function CycleTab() {
  const { cycle, cycleConfig, bumpCycle, saveCycleDates } = useAdmin();
  const c = cycleConfig as Cycle;
  const [openAt, setOpenAt] = useState(c.openAt ?? "");
  const [freezeAt, setFreezeAt] = useState(c.freezeAt ?? "");
  const [closeAt, setCloseAt] = useState(c.closeAt ?? "");
  const [payAt, setPayAt] = useState(c.payAt ?? "");
  const [lastRevisionAt, setLastRevisionAt] = useState(c.lastRevisionAt ?? "");
  const [saved, setSaved] = useState(false);

  const phase = cyclePhase(c);
  const label = countdownLabel(c);

  const save = async () => {
    await saveCycleDates({ openAt, freezeAt, closeAt, payAt, lastRevisionAt });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const PHASE_DOT: Record<string, string> = {
    before: "bg-info", open: "bg-ok", frozen: "bg-warn", closed: "bg-outline",
  };

  return (
    <div className="space-y-6">
      {/* Cycle number */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="label mb-1">Current cycle</p>
            <p className="mono text-3xl font-semibold text-on-surface">Cycle {cycle}</p>
            <p className="text-xs text-outline mt-1">Bumping the cycle resets everyone&apos;s per-cycle submission cap.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => bumpCycle(-1)} disabled={cycle <= 1} className="btn-secondary text-sm px-3 disabled:opacity-40">−</button>
            <button onClick={() => bumpCycle(1)} className="btn-primary text-sm px-3">+ New cycle</button>
          </div>
        </div>
      </div>

      {/* Live phase */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full ${PHASE_DOT[phase]}`} />
          <p className="mono text-sm text-on-surface uppercase tracking-wide">{phase}</p>
        </div>
        <p className="text-sm text-outline">{label ?? "Set the dates below to drive the freeze and the dashboard countdown."}</p>
      </div>

      {/* Dates */}
      <div className="card p-5">
        <p className="label mb-3">Cycle dates</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-xs text-outline">Opens
            <input type="date" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className="input mono mt-1" />
          </label>
          <label className="text-xs text-outline">Submissions close (freeze)
            <input type="date" value={freezeAt} onChange={(e) => setFreezeAt(e.target.value)} className="input mono mt-1" />
            <span className="block text-[10px] text-outline mt-1">New submissions blocked after this date. Resubmissions to an open revision still allowed.</span>
          </label>
          <label className="text-xs text-outline">Cycle ends
            <input type="date" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} className="input mono mt-1" />
          </label>
          <label className="text-xs text-outline">Payment target
            <input type="date" value={payAt} onChange={(e) => setPayAt(e.target.value)} className="input mono mt-1" />
          </label>
          <label className="text-xs text-outline">Last revision due
            <input type="date" value={lastRevisionAt} onChange={(e) => setLastRevisionAt(e.target.value)} className="input mono mt-1" />
            <span className="block text-[10px] text-outline mt-1">Hard cap: no revision deadline is ever set later than this, even if the 5-day window would run past it.</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={save} className="btn-primary text-sm">Save dates</button>
          {saved && <span className="text-xs text-ok">Saved</span>}
        </div>
      </div>
    </div>
  );
}

"use client";
import Link from "next/link";
import { Task, getCategoryLabel, getRequirementsLabel } from "@/lib/tasks";

// Full task spec, shown at the top of the review detail so reviewers always see the bar.
export function TaskSpecCard({ task }: { task: Task | null }) {
  if (!task) return null;
  const t = task;
  return (
    <div className="card p-5 border-l-4 border-[#E63329]">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#888888] mb-2">Task being reviewed</p>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="font-mono text-xs text-[#AAAAAA]">{t.id}</span>
        <span className={`badge-${t.category} text-[10px]`}>{getCategoryLabel(t.category)}</span>
      </div>
      <div className="text-sm text-[#1A1A2E] font-bold mb-2">{t.title}</div>
      <p className="text-xs text-[#555555] mb-3 leading-relaxed">{t.problem || t.shortDescription}</p>

      {t.technicalRequirements && t.technicalRequirements.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">{getRequirementsLabel(t.category)}</div>
          <ul className="text-xs text-[#555555] space-y-1">
            {t.technicalRequirements.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-[#E63329] shrink-0">•</span><span>{r}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">Required Deliverables</div>
        <ul className="text-xs text-[#555555] space-y-1">
          {t.deliverables.map((d, i) => (
            <li key={i} className="flex gap-2"><span className="text-[#E63329] font-semibold shrink-0">{i + 1}.</span><span>{d}</span></li>
          ))}
        </ul>
      </div>

      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">Quality Benchmarks</div>
        <ul className="text-xs text-[#555555] space-y-1">
          {t.qualityBenchmarks.map((b, i) => (
            <li key={i} className="flex gap-2"><span className="text-green-600 shrink-0">✓</span><span>{b}</span></li>
          ))}
        </ul>
      </div>

      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] mb-1">Failure Criteria</div>
        <ul className="text-xs text-[#555555] space-y-1">
          {t.failureCriteria.map((f, i) => (
            <li key={i} className="flex gap-2"><span className="text-red-500 shrink-0">✕</span><span>{f}</span></li>
          ))}
        </ul>
      </div>

      <Link href={`/tasks/${t.id}`} className="text-[10px] text-[#E63329] hover:underline">View full task page →</Link>
    </div>
  );
}

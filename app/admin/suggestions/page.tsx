"use client";
import { useEffect } from "react";
import { useAdmin } from "@/app/admin/AdminProvider";

const STATUS_OPTIONS = ["new", "reviewing", "accepted", "declined"];

export default function TaskSuggestionsTab() {
  const { suggestionItems, suggestionLoading, refreshSuggestions, updateSuggestionStatus } = useAdmin();
  useEffect(() => { refreshSuggestions(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
        <p className="text-on-surface font-semibold text-sm">Task Suggestions ({suggestionItems.length})</p>
        <button
          onClick={refreshSuggestions}
          className="text-xs text-outline hover:text-on-surface font-semibold transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      {suggestionLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Title</th>
                <th className="text-left px-4 py-3 font-semibold">Why it matters</th>
                <th className="text-left px-4 py-3 font-semibold">From</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {suggestionItems.map((s, i) => (
                <tr key={s.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                  <td className="px-4 py-3 text-xs text-outline whitespace-nowrap align-top">
                    {s.createdAt?.toDate?.()?.toLocaleString() ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-xs align-top">
                    <p className="font-semibold text-on-surface max-w-[220px]">{s.title}</p>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{s.link}</a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface align-top">
                    <p className="whitespace-pre-wrap max-w-[420px]">{s.rationale}</p>
                  </td>
                  <td className="px-4 py-3 text-xs align-top whitespace-nowrap">
                    {s.username && <p className="text-on-surface font-semibold">{s.username}</p>}
                    <p className="mono text-outline">
                      {s.from ? `${s.from.slice(0, 6)}...${s.from.slice(-4)}` : "-"}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <select
                      value={s.status || "new"}
                      onChange={(e) => updateSuggestionStatus(s.id, e.target.value)}
                      className="text-xs border border-surface-container-high rounded px-1.5 py-1 bg-surface-container-lowest text-on-surface focus:outline-none focus:border-brand"
                    >
                      {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {suggestionItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-outline">
                    No task suggestions yet. Submissions from the navbar &quot;Suggest a task&quot; button will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect } from "react";
import { useAdmin } from "@/app/admin/AdminProvider";

export default function FeedbackTab() {
  const { feedbackItems, feedbackLoading, refreshFeedback } = useAdmin();
  useEffect(() => { refreshFeedback(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
              <p className="text-on-surface font-semibold text-sm">Community Feedback ({feedbackItems.length})</p>
              <button
                onClick={refreshFeedback}
                className="text-xs text-outline hover:text-on-surface font-semibold transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
            {feedbackLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Message</th>
                      <th className="text-left px-4 py-3 font-semibold">From</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackItems.map((f, i) => (
                      <tr key={f.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                        <td className="px-4 py-3 text-xs text-outline whitespace-nowrap align-top">
                          {f.createdAt?.toDate?.()?.toLocaleString() ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`badge text-xs ${
                            f.type === "bug" ? "text-error" :
                            f.type === "suggestion" ? "text-info" :
                            "bg-surface-container-low text-on-surface"
                          }`}>
                            {f.type || "other"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-on-surface align-top">
                          <p className="whitespace-pre-wrap max-w-[520px]">{f.message}</p>
                        </td>
                        <td className="px-4 py-3 text-xs align-top whitespace-nowrap">
                          {f.username && <p className="text-on-surface font-semibold">{f.username}</p>}
                          <p className="mono text-outline">
                            {f.from ? `${f.from.slice(0, 6)}...${f.from.slice(-4)}` : "-"}
                          </p>
                        </td>
                      </tr>
                    ))}
                    {feedbackItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-sm text-outline">
                          No feedback yet. Submissions from the navbar Feedback button will appear here.
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

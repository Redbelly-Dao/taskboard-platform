"use client";
import { useEffect, useMemo } from "react";
import { useAdmin } from "@/app/admin/AdminProvider";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function FeedbackTab() {
  const { feedbackItems, feedbackLoading, refreshFeedback, resolveFeedback, resolvingFeedbackId } = useAdmin();
  useEffect(() => { refreshFeedback(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Open items first, resolved ones quieted and pushed below; the message itself stays fully readable either way.
  const sortedItems = useMemo(
    () => [...feedbackItems].sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved")),
    [feedbackItems]
  );

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
                      <th className="text-left px-4 py-3 font-semibold">Attachments</th>
                      <th className="text-left px-4 py-3 font-semibold">From</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((f, i) => {
                      const resolved = f.status === "resolved";
                      return (
                        <tr
                          key={f.id}
                          className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"} ${resolved ? "opacity-60" : ""}`}
                        >
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
                            <p className="whitespace-pre-wrap break-words max-w-[420px]">{f.message}</p>
                          </td>
                          <td className="px-4 py-3 text-xs align-top">
                            {resolved ? (
                              f.purgedAttachmentCount ? (
                                <p className="mono text-[11px] text-outline whitespace-nowrap">
                                  {f.purgedAttachmentCount} screenshot{f.purgedAttachmentCount === 1 ? "" : "s"} (deleted on resolve)
                                </p>
                              ) : (
                                <span className="text-outline">-</span>
                              )
                            ) : f.attachments?.length ? (
                              <div className="flex gap-1.5">
                                {f.attachments.map((a: any) => (
                                  <a
                                    key={a.key}
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`${a.name} (${formatBytes(a.size)})`}
                                    className="block w-10 h-10 rounded overflow-hidden border border-outline-variant hover:border-brand transition-colors"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="text-outline">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs align-top whitespace-nowrap">
                            {f.username && <p className="text-on-surface font-semibold">{f.username}</p>}
                            <p className="mono text-outline">
                              {f.from ? `${f.from.slice(0, 6)}...${f.from.slice(-4)}` : "-"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs align-top whitespace-nowrap">
                            {resolved ? (
                              <span className="badge text-ok text-xs">resolved</span>
                            ) : (
                              <button
                                onClick={() => resolveFeedback(f.id)}
                                disabled={resolvingFeedbackId === f.id}
                                className="btn-secondary text-xs"
                              >
                                {resolvingFeedbackId === f.id ? "Resolving…" : "Mark resolved"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {feedbackItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-outline">
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

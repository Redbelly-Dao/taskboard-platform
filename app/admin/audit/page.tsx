"use client";
import { useEffect } from "react";
import { useAdmin, AUDIT_ACTION_LABELS } from "@/app/admin/AdminProvider";

export default function AuditTab() {
  const { auditLogs, auditLoading, refreshAuditLog } = useAdmin();
  useEffect(() => { refreshAuditLog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
              <p className="text-on-surface font-semibold text-sm">Admin Audit Log</p>
              <button
                onClick={refreshAuditLog}
                className="text-xs text-outline hover:text-on-surface font-semibold transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
            {auditLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                      <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
                      <th className="text-left px-4 py-3 font-semibold">Action</th>
                      <th className="text-left px-4 py-3 font-semibold">Admin</th>
                      <th className="text-left px-4 py-3 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, i) => (
                      <tr key={log.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                        <td className="px-4 py-3 text-xs text-outline whitespace-nowrap">
                          {log.timestamp?.toDate?.()?.toLocaleString() ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge text-xs ${
                            log.action === "admin_override" ? "text-warn" :
                            log.action === "payment_marked_paid" ? "text-ok" :
                            log.action === "user_suspended" || log.action === "task_deleted" ? "text-error" :
                            log.action === "user_unsuspended" ? "text-ok" :
                            "bg-surface-container-low text-on-surface"
                          }`}>
                            {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 mono text-xs text-outline">
                          {log.adminWallet
                            ? `${log.adminWallet.slice(0, 6)}...${log.adminWallet.slice(-4)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-on-surface">
                          {log.action === "admin_override" && (
                            <div>
                              <span className="mono font-semibold">{log.taskId}</span>
                              {" "}&rarr;{" "}
                              <span className={log.decision === "approved" ? "text-ok font-semibold" : "text-error font-semibold"}>
                                {log.decision}
                              </span>
                              {log.previousStatus && (
                                <span className="text-outline"> (was: {log.previousStatus.replace(/_/g, " ")})</span>
                              )}
                              {log.feedback && (
                                <p className="text-outline mt-0.5 italic truncate max-w-[280px]">"{log.feedback}"</p>
                              )}
                            </div>
                          )}
                          {log.action === "role_change" && (
                            <span>
                              {log.oldRole} &rarr; <span className="font-semibold text-on-surface">{log.newRole}</span>
                              <span className="text-outline ml-1">(uid: {log.userId?.slice(0, 8)})</span>
                            </span>
                          )}
                          {(log.action === "user_suspended" || log.action === "user_unsuspended") && (
                            <span className="mono">
                              {log.userWallet
                                ? `${log.userWallet.slice(0, 8)}...${log.userWallet.slice(-4)}`
                                : log.userId?.slice(0, 8)}
                            </span>
                          )}
                          {log.action === "payment_marked_paid" && (
                            <span>
                              <span className="mono font-semibold">{log.taskId}</span>
                              {" for "}
                              <span className="mono">
                                {log.contributorWallet
                                  ? `${log.contributorWallet.slice(0, 6)}...${log.contributorWallet.slice(-4)}`
                                  : "-"}
                              </span>
                            </span>
                          )}
                          {log.action === "task_deleted" && (
                            <span>
                              <span className="mono font-semibold">{log.taskId}</span>
                              {log.taskTitle && <span className="text-outline"> ({log.taskTitle})</span>}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-sm text-outline">
                          No audit log entries yet. Actions will appear here as you use the admin panel.
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

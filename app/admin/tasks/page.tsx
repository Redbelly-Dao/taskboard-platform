"use client";
import { useState } from "react";
import { Task, getCategoryLabel, getStatusLabel, formatReward, TASK_STATUSES } from "@/lib/tasks";
import { useAdmin } from "@/app/admin/AdminProvider";

export default function TasksTab() {
  const { tasks, setDeleteConfirmId, cycle, bumpCycle, boardPaused, pauseMessage, setPauseMessage, toggleBoardPause, savePauseMessage, updateTaskStatus, openAddTask, openEditTask, displayTasks, taskSubmissionCounts, goToTaskSubmissions } = useAdmin();
  const [cycleFilter, setCycleFilter] = useState("all");
  const cyclesPresent = Array.from(
    new Set(tasks.map((t: Task) => t.cycle).filter((c: unknown): c is number => typeof c === "number"))
  ).sort((a, b) => b - a);
  const visibleTasks = cycleFilter === "all" ? displayTasks : displayTasks.filter((t: Task) => String(t.cycle ?? "") === cycleFilter);
  return (
          <div>
            {/* Board-wide maintenance pause */}
            <div className={`rounded-xl p-4 mb-6 border ${boardPaused ? "bg-surface-container-low border-brand/30" : "bg-surface-slate border-surface-container-high"}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className={`text-sm font-semibold mb-1 ${boardPaused ? "text-primary" : "text-on-surface"}`}>
                    {boardPaused ? "Board is paused" : "Board is live"}
                  </p>
                  <p className="text-xs text-on-surface max-w-2xl">
                    {boardPaused
                      ? "Everyone except admins sees a maintenance screen instead of the board. The public ledger stays visible. You keep full access."
                      : "Pause the whole board for maintenance between cycles. The public ledger stays visible, and admins keep full access."}
                  </p>
                </div>
                <button
                  onClick={toggleBoardPause}
                  className={`text-xs px-4 py-2 rounded-lg font-semibold ${boardPaused ? "btn-primary" : "border border-brand text-primary hover:bg-surface-container-low"}`}
                >
                  {boardPaused ? "Reopen board" : "Pause board"}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <input
                  value={pauseMessage}
                  onChange={(e) => setPauseMessage(e.target.value)}
                  onBlur={savePauseMessage}
                  placeholder="Optional message shown on the paused screen (defaults to a standard maintenance note)"
                  className="input text-xs flex-1 min-w-[240px]"
                />
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
                <p className="text-on-surface font-semibold text-sm">All Tasks ({visibleTasks.length})</p>
                <div className="flex items-center gap-4">
                  {cyclesPresent.length > 0 && (
                    <select
                      className="text-xs border border-surface-container-high rounded-lg px-2 py-1 bg-surface-slate text-on-surface focus:outline-none focus:border-brand"
                      value={cycleFilter}
                      onChange={(e) => setCycleFilter(e.target.value)}
                    >
                      <option value="all">All cycles</option>
                      {cyclesPresent.map((c: number) => <option key={c} value={String(c)}>Cycle {c}</option>)}
                    </select>
                  )}
                  <div className="flex items-center gap-2 text-on-surface text-xs">
                    <span className="text-outline" title="Submission cycle: bump this to reset everyone's per-cycle submission cap for fresh task batches.">Cycle</span>
                    <button onClick={() => bumpCycle(-1)} disabled={cycle == null || cycle <= 1} className="w-6 h-6 rounded bg-surface-slate/10 hover:bg-surface-slate/20 disabled:opacity-30 disabled:cursor-not-allowed">−</button>
                    <span className="font-bold w-5 text-center">{cycle ?? "…"}</span>
                    <button onClick={() => bumpCycle(1)} disabled={cycle == null} className="w-6 h-6 rounded bg-surface-slate/10 hover:bg-surface-slate/20 disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                  </div>
                  <button onClick={openAddTask} className="btn-primary text-xs px-3 py-1.5">+ Add Task</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                      <th className="text-left px-4 py-3 font-semibold">ID</th>
                      <th className="text-left px-4 py-3 font-semibold">Title</th>
                      <th className="text-left px-4 py-3 font-semibold">Category</th>
                      <th className="text-left px-4 py-3 font-semibold">Reward</th>
                      <th className="text-left px-4 py-3 font-semibold">Subs</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((task, i) => (
                      <tr key={task.id} className={`border-b border-surface-container-high ${i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"} ${task.status === "completed" ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3 mono text-xs font-semibold text-on-surface">
                          {task.id}{typeof task.cycle === "number" && <span className="block text-[10px] text-outline font-normal">c{task.cycle}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-on-surface max-w-[200px] truncate">{task.title}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge-${task.category}`}>{getCategoryLabel(task.category)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-primary">{formatReward(task.rewardRbnt, task.reward)}</td>
                        <td className="px-4 py-3 text-xs">
                          {taskSubmissionCounts[task.id] ? (
                            <button
                              onClick={() => goToTaskSubmissions(task.id)}
                              className="font-bold text-primary hover:underline"
                            >
                              {taskSubmissionCounts[task.id]}
                            </button>
                          ) : (
                            <span className="text-outline">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={task.status}
                            onChange={(e) => updateTaskStatus(task.id, e.target.value as Task["status"])}
                            className="text-xs border border-surface-container-high rounded-lg px-2 py-1 bg-surface-slate text-on-surface focus:outline-none focus:border-brand"
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>{getStatusLabel(s)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEditTask(task)} className="text-xs text-primary font-semibold hover:underline">Edit</button>
                            <button onClick={() => setDeleteConfirmId(task.id)} className="text-xs text-outline hover:text-error font-semibold transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {tasks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          <p className="text-sm text-outline mb-3">No tasks yet.</p>
                          <button onClick={openAddTask} className="btn-primary text-xs">Add Your First Task</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
  );
}

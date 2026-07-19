"use client";
import { useAdmin } from "@/app/admin/AdminProvider";

export default function UsersTab() {
  const { users, userSearch, setUserSearch, preGrantRole, updateRole, suspendUser, filteredUsers } = useAdmin();
  return (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-container-highest)" }}>
              <p className="text-on-surface font-semibold text-sm">
                All Users ({filteredUsers.length}{filteredUsers.length !== users.length ? `/${users.length}` : ""})
              </p>
              <p className="text-outline text-xs">Change roles via the dropdown</p>
            </div>
            <div className="px-4 py-3 border-b border-surface-container-high bg-surface-slate flex flex-wrap gap-3 items-end">
              <input
                className="input text-xs w-full max-w-sm"
                placeholder="Search by wallet address or Discord handle..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />

              {/* Pre-grant role to unregistered wallet (add user feature) */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value;
                const ok = await preGrantRole({
                  wallet: field("wallet"),
                  role: field("role"),
                  username: field("uname").trim(),
                  discordHandle: field("dc").trim(),
                });
                if (ok) { alert("Pre-granted. User will get role on register."); form.reset(); }
              }} className="flex gap-2 items-end text-xs">
                <input name="wallet" placeholder="0x wallet" className="input text-xs w-40" required />
                <select name="role" className="input text-xs">
                  <option value="contributor">contributor</option>
                  <option value="reviewer">reviewer</option>
                  <option value="admin">admin</option>
                </select>
                <input name="uname" placeholder="username" className="input text-xs w-28" />
                <input name="dc" placeholder="discord" className="input text-xs w-28" />
                <button type="submit" className="btn-primary text-xs px-3 py-1">Pre-grant Role</button>
              </form>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-container-low text-xs text-outline border-b border-surface-container-high">
                    <th className="text-left px-4 py-3 font-semibold">Display Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Wallet Address</th>
                    <th className="text-left px-4 py-3 font-semibold">Discord</th>
                    <th className="text-left px-4 py-3 font-semibold">Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Joined</th>
                    <th className="text-left px-4 py-3 font-semibold">Change Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, i) => (
                    <tr key={u.id} className={`border-b border-surface-container-high ${u.suspended ? "opacity-50" : i % 2 === 1 ? "bg-surface-container-low" : "bg-surface-slate"}`}>
                      <td className="px-4 py-3 text-xs font-semibold text-on-surface">{u.username || <span className="text-outline font-normal">-</span>}</td>
                      <td className="px-4 py-3 mono text-xs text-on-surface">{u.walletAddress}</td>
                      <td className="px-4 py-3 text-xs text-outline">{u.discordHandle || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`badge ${
                            u.role === "admin" ? "bg-surface-container-low text-primary" :
                            u.role === "reviewer" ? "text-info" :
                            "bg-surface-container-low text-outline"
                          }`}>{u.role}</span>
                          {u.suspended && <span className="badge text-error">suspended</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-outline">
                        {u.createdAt?.toDate?.()?.toLocaleDateString() ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {u.role !== "admin" ? (
                          <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)}
                            className="text-xs border border-surface-container-high rounded-lg px-2 py-1 bg-surface-slate text-on-surface focus:outline-none focus:border-brand">
                            <option value="contributor">Contributor</option>
                            <option value="reviewer">Reviewer</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span className="text-xs text-outline">Admin</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.role !== "admin" && (
                          <button
                            onClick={() => suspendUser(u.id, !u.suspended)}
                            className={`text-xs font-semibold transition-colors ${
                              u.suspended ? "text-ok hover:text-ok" : "text-error hover:text-error"
                            }`}
                          >
                            {u.suspended ? "Unsuspend" : "Suspend"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-outline">
                      {users.length === 0 ? "No users yet." : "No users match your search."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
  );
}

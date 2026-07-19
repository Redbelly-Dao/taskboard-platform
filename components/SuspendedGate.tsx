"use client";
import { useAuth } from "@/lib/auth-context";

export default function SuspendedGate({ children }: { children: React.ReactNode }) {
  const { appUser, loading, logout } = useAuth();

  if (!loading && appUser?.suspended && appUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-background-deep flex items-center justify-center px-4">
        <div className="card card-lg p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 border border-brand rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-on-surface mb-2">Account suspended</h1>
          <p className="text-sm text-outline leading-relaxed mb-2">
            Your account has been suspended pending verification.
          </p>
          <p className="text-sm text-outline leading-relaxed mb-5">
            To regain access, apply through the Redbelly DAO website to verify your membership,
            then reach out in the <a href="https://discord.com/channels/969088176322908160/1471738127860236424" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">#DAO TASKBOARD</a> channel.
          </p>
          <p className="text-xs text-outline mb-6">
            Registered wallet: <span className="mono">{appUser.walletAddress}</span>
          </p>
          <button onClick={logout} className="btn-secondary text-sm w-full justify-center">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

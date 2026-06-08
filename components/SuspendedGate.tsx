"use client";
import { useAuth } from "@/lib/auth-context";

export default function SuspendedGate({ children }: { children: React.ReactNode }) {
  const { appUser, loading, logout } = useAuth();

  if (!loading && appUser && appUser.approved === false && appUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-[#FEF0EF] rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#E63329]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">Pending Approval</h1>
          <p className="text-sm text-[#555555] leading-relaxed mb-5">
            Your account is awaiting admin approval. You will gain access once an admin reviews and approves your registration.
            Reach out in <span className="font-semibold">#taskboard-updates</span> on Discord to follow up.
          </p>
          <p className="text-xs text-[#AAAAAA] mb-6">
            Registered wallet: <span className="font-mono">{appUser.walletAddress}</span>
          </p>
          <button onClick={logout} className="btn-secondary text-sm w-full">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!loading && appUser?.suspended && appUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-[#FEF0EF] rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#E63329]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">Account Suspended</h1>
          <p className="text-sm text-[#555555] leading-relaxed mb-2">
            Your account has been suspended pending verification.
          </p>
          <p className="text-sm text-[#555555] leading-relaxed mb-5">
            To unlock access, apply through the Redbelly DAO website to verify your membership,
            then contact an admin on Discord.
          </p>
          <p className="text-xs text-[#AAAAAA] mb-6">
            Registered wallet: <span className="font-mono">{appUser.walletAddress}</span>
          </p>
          <button onClick={logout} className="btn-secondary text-sm w-full">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

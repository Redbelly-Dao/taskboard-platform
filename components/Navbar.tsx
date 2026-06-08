"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
  const { user, appUser, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const dashboardHref =
    appUser?.role === "admin" ? "/admin" :
    appUser?.role === "reviewer" ? "/reviewer" : "/dashboard";

  return (
    <nav className="page-header sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href={dashboardHref} className="flex items-center gap-2.5 flex-shrink-0">
          <Image src="/dao-logo.png" alt="Redbelly DAO" height={32} width={47} className="object-contain" />
          <span className="text-[#555555] text-sm font-medium hidden sm:block">Task Board</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {appUser && (
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="btn-ghost text-sm">Dashboard</Link>
              {appUser.role === "admin" && (
                <>
                  <Link href="/admin" className="btn-ghost text-sm hidden sm:block">Admin</Link>
                  <Link href="/reviewer" className="btn-ghost text-sm hidden sm:block">Reviews</Link>
                </>
              )}
              {appUser.role === "reviewer" && (
                <Link href="/reviewer" className="btn-ghost text-sm hidden sm:block">Reviews</Link>
              )}
              {appUser.role === "contributor" && (
                <Link href="/submissions" className="btn-ghost text-sm hidden sm:block">My Submissions</Link>
              )}
            </div>
          )}

          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-[#E8EBF0]">
              {appUser && (
                <div className="bg-[#F4F5F7] border border-[#E8EBF0] rounded-lg px-3 py-1.5">
                  <p className="text-xs font-mono font-semibold text-[#1A1A2E] leading-tight">
                    {appUser.walletAddress.slice(0, 6)}…{appUser.walletAddress.slice(-4)}
                  </p>
                  <p className="text-[10px] text-[#E63329] capitalize font-bold leading-tight">{appUser.role}</p>
                </div>
              )}
              <button onClick={handleLogout} className="btn-ghost text-xs">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

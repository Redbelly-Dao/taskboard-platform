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
        <Link href={dashboardHref} className="flex items-center gap-2.5">
          <Image src="/dao-logo.png" alt="Redbelly DAO" height={32} width={47} className="object-contain" />
          <span className="text-[#555555] text-sm font-medium hidden sm:block">Task Board</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-6">
          {appUser && (
            <>
              <Link href={dashboardHref} className="btn-ghost">
                Dashboard
              </Link>
              {appUser.role === "admin" && (
                <Link href="/admin" className="btn-ghost">
                  Users
                </Link>
              )}
              {appUser.role === "reviewer" && (
                <Link href="/reviewer" className="btn-ghost">
                  Reviews
                </Link>
              )}
            </>
          )}

          {user && (
            <div className="flex items-center gap-3 pl-4 border-l border-[#E8EBF0]">
              {appUser && (
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold text-[#1A1A2E] truncate max-w-[120px]">
                    {appUser.walletAddress.slice(0, 6)}...{appUser.walletAddress.slice(-4)}
                  </p>
                  <p className="text-xs text-[#E63329] capitalize font-medium">{appUser.role}</p>
                </div>
              )}
              <button onClick={handleLogout} className="btn-ghost text-xs">
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

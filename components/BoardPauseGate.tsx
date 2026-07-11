"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

// Paths that stay reachable while the board is paused: the public ledger, and
// the auth pages so an admin can still sign in to lift the pause. Admins bypass
// the gate entirely (see below), so they keep full access to unpause.
const ALWAYS_OPEN = ["/ledger", "/login", "/register", "/forgot-password"];

export default function BoardPauseGate({ children }: { children: React.ReactNode }) {
  const { appUser } = useAuth();
  const pathname = usePathname() || "/";
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "config", "board"),
      (snap) => {
        const d = snap.data() as { paused?: boolean; message?: string } | undefined;
        setPaused(!!d?.paused);
        setMessage(d?.message || "");
      },
      () => { /* read failure: fail open, never trap users behind a gate we can't read */ }
    );
    return () => unsub();
  }, []);

  const exempt =
    appUser?.role === "admin" || ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (paused && !exempt) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="flex items-center justify-center mb-6">
            <Image src="/dao-logo.png" alt="Redbelly DAO" height={40} width={59} className="object-contain" />
          </div>
          <div className="w-14 h-14 bg-[#FEF0EF] rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#E63329]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">The Task Board is paused</h1>
          <p className="text-sm text-[#555555] leading-relaxed mb-5">
            {message
              ? message
              : "The board is closed for maintenance between cycles while we prepare the next wave of tasks. It will reopen shortly. Thanks for your patience."}
          </p>
          <Link href="/ledger" className="btn-secondary text-sm w-full inline-block">
            View the public ledger
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

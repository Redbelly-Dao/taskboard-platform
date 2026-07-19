"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Logo from "@/components/Logo";

// Paths that stay reachable while the board is paused: the public ledger,
// and the auth pages so an admin can still sign in to lift the pause.
// Admins bypass the gate entirely (see below), so they keep full access to unpause.
const ALWAYS_OPEN = ["/ledger", "/login", "/register"];

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

  // Local testing override: set NEXT_PUBLIC_IGNORE_PAUSE=true in .env.local to click through the whole board
  // while it stays paused for everyone on the hosted deploy (the host has no such env var unless you add it in Vercel).
  const bypass = process.env.NEXT_PUBLIC_IGNORE_PAUSE === "true";

  const exempt =
    bypass || appUser?.role === "admin" || ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (paused && !exempt) {
    return (
      <div className="min-h-screen bg-background-deep flex items-center justify-center px-4">
        <div className="card card-lg p-8 max-w-md w-full text-center">
          <div className="flex items-center justify-center mb-6">
            <Logo height={40} width={59} />
          </div>
          <div className="w-14 h-14 border border-brand rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-on-surface mb-2">The Task Board is paused</h1>
          <p className="text-sm text-outline leading-relaxed mb-5">
            {message
              ? message
              : "The board is closed for maintenance between cycles while we prepare the next wave of tasks. It will reopen shortly. Thanks for your patience."}
          </p>
          <Link href="/ledger" className="btn-secondary text-sm w-full justify-center">
            View the public ledger
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

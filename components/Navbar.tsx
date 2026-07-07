"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, query, where, onSnapshot,
  updateDoc, doc, arrayUnion, limit, addDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

function timeAgo(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Navbar() {
  const { user, appUser, logout } = useAuth();
  const router = useRouter();

  const [personalNotifs, setPersonalNotifs] = useState<any[]>([]);
  const [broadcastNotifs, setBroadcastNotifs] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !appUser) {
      setPersonalNotifs([]);
      setBroadcastNotifs([]);
      return;
    }

    const unsubs: (() => void)[] = [];

    const personalQ = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      limit(50)
    );
    unsubs.push(onSnapshot(personalQ, (snap) => {
      setPersonalNotifs(snap.docs.map((d) => ({ id: d.id, _kind: "personal", ...d.data() })));
    }));

    if (appUser.role === "admin") {
      const broadcastQ = query(
        collection(db, "notifications"),
        where("forAdmins", "==", true),
        limit(50)
      );
      unsubs.push(onSnapshot(broadcastQ, (snap) => {
        setBroadcastNotifs(snap.docs.map((d) => ({ id: d.id, _kind: "broadcast", ...d.data() })));
      }));
    }

    return () => unsubs.forEach((u) => u());
  }, [user, appUser]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allNotifs = [...personalNotifs, ...broadcastNotifs].sort(
    (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
  );

  const unread = allNotifs.filter((n) =>
    n._kind === "broadcast" ? !n.readBy?.includes(user?.uid) : !n.read
  );

  const markRead = async (notif: any) => {
    try {
      if (notif._kind === "broadcast") {
        await updateDoc(doc(db, "notifications", notif.id), { readBy: arrayUnion(user!.uid) });
      } else {
        await updateDoc(doc(db, "notifications", notif.id), { read: true });
      }
    } catch { /* non-blocking */ }
  };

  const markAllRead = () => Promise.all(unread.map(markRead));

  const handleNotifClick = (notif: any) => {
    markRead(notif);
    setShowDropdown(false);
    // Contributors: /tasks/[taskId] is a real route and already shows their
    // own submission, decision, and revision history, so go straight there.
    // Reviewers/admins: /reviewer's detail view isn't its own route yet, so we
    // pass the submission via a query param and let the page open it once its
    // data has loaded (see the effect in app/reviewer/page.tsx).
    if (appUser?.role === "admin" || appUser?.role === "reviewer") {
      if (notif.submissionId) router.push(`/reviewer?submission=${notif.submissionId}`);
      else router.push("/reviewer");
    } else if (notif.taskId) {
      router.push(`/tasks/${notif.taskId}`);
    } else {
      router.push("/submissions");
    }
  };

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
              {/* Notification Bell */}
              {appUser && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown((v) => !v)}
                    className="relative p-1.5 rounded-lg hover:bg-[#F4F5F7] transition-colors"
                    aria-label="Notifications"
                  >
                    <svg className="w-5 h-5 text-[#555555]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unread.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#E63329] text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                        {unread.length > 9 ? "9+" : unread.length}
                      </span>
                    )}
                  </button>

                  {showDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E8EBF0] rounded-xl shadow-2xl overflow-hidden z-[100]">
                      <div className="px-4 py-3 border-b border-[#E8EBF0] flex items-center justify-between">
                        <p className="font-semibold text-sm text-[#1A1A2E]">
                          Notifications
                          {unread.length > 0 && (
                            <span className="ml-2 bg-[#E63329] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                              {unread.length}
                            </span>
                          )}
                        </p>
                        {unread.length > 0 && (
                          <button onClick={markAllRead} className="text-xs text-[#E63329] font-semibold hover:underline">
                            Mark all read
                          </button>
                        )}
                      </div>

                      <div className="max-h-80 overflow-y-auto divide-y divide-[#F4F5F7]">
                        {unread.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <svg className="w-8 h-8 text-[#DDDDDD] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <p className="text-sm text-[#AAAAAA]">You're all caught up.</p>
                          </div>
                        ) : (
                          unread.slice(0, 15).map((notif) => (
                            <button
                              key={notif.id}
                              onClick={() => handleNotifClick(notif)}
                              className="w-full text-left px-4 py-3 hover:bg-[#FEF0EF] transition-colors"
                            >
                              <div className="flex items-start gap-2.5">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  notif.senderRole === "admin" ? "bg-[#E63329]" :
                                  notif.senderRole === "reviewer" ? "bg-blue-500" :
                                  "bg-[#888888]"
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-[#1A1A2E] truncate">
                                    {notif.taskId}
                                    {notif.taskTitle && (
                                      <span className="font-normal text-[#888888]"> · {notif.taskTitle}</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-[#555555] mt-0.5">
                                    <span className="capitalize font-medium">{notif.senderRole}</span>
                                    {": "}
                                    <span className="text-[#888888] italic">{notif.messagePreview}</span>
                                  </p>
                                  <p className="text-[10px] text-[#AAAAAA] mt-1">
                                    {notif.createdAt?.seconds ? timeAgo(notif.createdAt.seconds) : "recently"}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {appUser && (
                <div className="bg-[#F4F5F7] border border-[#E8EBF0] rounded-lg px-3 py-1.5">
                  <Link href="/profile" className="text-xs font-semibold text-[#1A1A2E] leading-tight hover:text-[#E63329]">
                    {appUser.username || `${appUser.walletAddress.slice(0, 6)}…${appUser.walletAddress.slice(-4)}`}
                  </Link>
                  <p className="text-[10px] text-[#E63329] capitalize font-bold leading-tight">{appUser.role}</p>
                </div>
              )}

              {/* Feedback mechanism - beautiful matching UI */}
              <button
                onClick={async () => {
                  const type = prompt("Type (bug / suggestion / other):", "suggestion");
                  const msg = prompt("Your feedback:");
                  if (msg && appUser) {
                    await addDoc(collection(db, "feedback"), {
                      from: appUser.walletAddress,
                      username: appUser.username || null,
                      type: type || "other",
                      message: msg,
                      createdAt: serverTimestamp(),
                    });
                    alert("Thanks for the feedback!");
                  }
                }}
                className="btn-ghost text-xs"
              >
                Feedback
              </button>
              <button onClick={handleLogout} className="btn-ghost text-xs">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

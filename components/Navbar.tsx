"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  collection, query, where, onSnapshot,
  updateDoc, doc, arrayUnion, limit, addDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import Modal from "@/components/ui/Modal";
import { useUploadThing } from "@/lib/uploadthing";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// Simple user avatar, so the profile chip reads as a person rather than a bare box.
function AvatarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z" />
    </svg>
  );
}

function timeAgo(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type NavLink = { href: string; label: string };

// One source of truth for a role's links, so the desktop bar and the mobile drawer can never drift apart.
function linksFor(role?: string): NavLink[] {
  const links: NavLink[] = [{ href: "/dashboard", label: "Dashboard" }];
  if (role === "admin") {
    links.push(
      { href: "/admin", label: "Admin" },
      { href: "/reviewer", label: "Reviews" },
      { href: "/ledger", label: "Ledger" },
    );
  } else if (role === "reviewer") {
    links.push(
      { href: "/reviewer", label: "Reviews" },
      { href: "/submissions", label: "My Submissions" },
      { href: "/ledger", label: "Ledger" },
    );
  } else if (role === "contributor") {
    links.push(
      { href: "/submissions", label: "My Submissions" },
      { href: "/ledger", label: "Ledger" },
    );
  }
  return links;
}

export default function Navbar() {
  const { user, appUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [personalNotifs, setPersonalNotifs] = useState<any[]>([]);
  const [broadcastNotifs, setBroadcastNotifs] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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

  // Close the drawer on navigation, otherwise it hangs over the new page.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

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
    if (appUser?.role === "admin" || appUser?.role === "reviewer") {
      if (notif.submissionId) router.push(`/reviewer/${notif.submissionId}`);
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

  const navLinks = linksFor(appUser?.role);

  return (
    <>
      <nav className="page-header sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href={dashboardHref} className="flex items-center gap-2.5 flex-shrink-0">
            <Logo />
          </Link>

          {/* Desktop links */}
          {appUser && (
            <div className="hidden md:flex items-center gap-5 flex-1">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-sm transition-colors ${
                    pathname === l.href ? "text-primary font-semibold" : "text-on-surface hover:text-primary"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}

          {/* Right cluster */}
          {user && (
            <div className="flex items-center gap-3">
              <ThemeToggle />

              {/* Notification bell */}
              {appUser && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown((v) => !v)}
                    className="relative p-1.5 rounded hover:bg-surface-container-high transition-colors"
                    aria-label="Notifications"
                  >
                    <svg className="w-5 h-5 text-on-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unread.length > 0 && (
                      <span className="mono absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                        {unread.length > 9 ? "9+" : unread.length}
                      </span>
                    )}
                  </button>

                  {showDropdown && (
                    <div className="glass absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded overflow-hidden z-[100]">
                      <div className="px-4 py-3 card-rule flex items-center justify-between">
                        <p className="font-semibold text-sm text-on-surface">
                          Notifications
                          {unread.length > 0 && (
                            <span className="mono ml-2 bg-brand text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                              {unread.length}
                            </span>
                          )}
                        </p>
                        {unread.length > 0 && (
                          <button onClick={markAllRead} className="text-xs text-primary font-semibold hover:underline">
                            Mark all read
                          </button>
                        )}
                      </div>

                      <div className="max-h-80 overflow-y-auto">
                        {unread.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <p className="text-sm text-outline">You are all caught up.</p>
                          </div>
                        ) : (
                          unread.slice(0, 15).map((notif) => (
                            <button
                              key={notif.id}
                              onClick={() => handleNotifClick(notif)}
                              className="w-full text-left px-4 py-3 hover:bg-surface-container-high transition-colors border-b border-surface-container-high last:border-0"
                            >
                              <div className="flex items-start gap-2.5">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  notif.senderRole === "admin" ? "bg-brand" :
                                  notif.senderRole === "reviewer" ? "bg-secondary" :
                                  "bg-outline"
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-on-surface truncate">
                                    <span className="mono">{notif.taskId}</span>
                                    {notif.taskTitle && (
                                      <span className="font-normal text-outline"> · {notif.taskTitle}</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-outline mt-0.5">
                                    <span className="capitalize font-medium text-on-surface">{notif.senderRole}</span>
                                    {": "}
                                    <span className="italic">{notif.messagePreview}</span>
                                  </p>
                                  <p className="mono text-[10px] text-outline mt-1">
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

              {/* Profile chip */}
              {appUser && (
                <Link
                  href="/profile"
                  className="hidden sm:flex items-center gap-2 border border-outline-variant rounded px-2.5 py-1.5 hover:border-brand transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
                    <AvatarIcon className="w-4 h-4" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-xs font-semibold text-on-surface">
                      {appUser.username || `${appUser.walletAddress.slice(0, 6)}…${appUser.walletAddress.slice(-4)}`}
                    </span>
                    <span className="block mono text-[10px] text-primary uppercase font-bold">{appUser.role}</span>
                  </span>
                </Link>
              )}

              {/* Desktop-only actions */}
              <div className="hidden md:flex items-center gap-3 pl-3 border-l border-surface-container-high">
                <button onClick={() => setFeedbackOpen(true)} className="btn-ghost text-xs">Feedback</button>
                <button onClick={handleLogout} className="btn-ghost text-xs">Sign out</button>
              </div>

              {/* Hamburger: below md this is the only way to reach /admin,
                  /reviewer, /ledger and /submissions. */}
              <button
                onClick={() => setMenuOpen(true)}
                className="md:hidden p-1.5 rounded hover:bg-surface-container-high transition-colors"
                aria-label="Open menu"
                aria-expanded={menuOpen}
              >
                <svg className="w-6 h-6 text-on-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[110] flex">
          <button className="flex-1 bg-black/60" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
          <div className="glass w-72 max-w-[80vw] h-full flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between card-rule">
              <span className="label mb-0">Menu</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="p-1 text-on-surface hover:text-primary">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {appUser && (
              <Link href="/profile" className="px-4 py-3 card-rule hover:bg-surface-container-high transition-colors flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
                  <AvatarIcon className="w-5 h-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-on-surface">
                    {appUser.username || `${appUser.walletAddress.slice(0, 6)}…${appUser.walletAddress.slice(-4)}`}
                  </span>
                  <span className="block mono text-[10px] text-primary uppercase font-bold mt-0.5">{appUser.role}</span>
                </span>
              </Link>
            )}

            <div className="flex-1 overflow-y-auto py-2">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`block px-4 py-3 text-sm transition-colors ${
                    pathname === l.href
                      ? "text-primary font-semibold bg-surface-container-high"
                      : "text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <div className="p-4 border-t border-surface-container-high flex flex-col gap-2">
              <button onClick={() => { setMenuOpen(false); setFeedbackOpen(true); }} className="btn-secondary text-xs justify-center">
                Send feedback
              </button>
              <button onClick={handleLogout} className="btn-ghost text-xs py-2">Sign out</button>
            </div>
          </div>
        </div>
      )}

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}

type PendingImage = { file: File; previewUrl: string };

// General product feedback: bugs, ideas, anything not working. Tracked in the admin Feedback tab.
function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { appUser } = useAuth();
  const [type, setType] = useState("bug");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [imageError, setImageError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { startUpload, isUploading } = useUploadThing("feedbackImage");

  const addImages = (files: FileList | null) => {
    if (!files) return;
    setImageError("");
    const next: PendingImage[] = [];
    for (const file of Array.from(files)) {
      if (images.length + next.length >= MAX_ATTACHMENTS) {
        setImageError(`Up to ${MAX_ATTACHMENTS} images.`);
        break;
      }
      if (!file.type.startsWith("image/")) {
        setImageError("Only image files are supported.");
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setImageError("Each image must be under 5MB.");
        continue;
      }
      next.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    if (next.length) setImages((prev) => [...prev, ...next]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const send = async () => {
    if (!message.trim() || !appUser) return;
    setSending(true);
    try {
      let attachments: { url: string; key: string; name: string; size: number }[] = [];
      if (images.length) {
        const uploaded = await startUpload(images.map((i) => i.file));
        if (!uploaded) throw new Error("Upload failed");
        attachments = uploaded.map((f) => ({ url: f.ufsUrl, key: f.key, name: f.name, size: f.size }));
      }

      await addDoc(collection(db, "feedback"), {
        from: appUser.walletAddress,
        username: appUser.username || null,
        type,
        message: message.trim(),
        attachments,
        createdAt: serverTimestamp(),
      });
      images.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      setSent(true);
      setTimeout(onClose, 1200);
    } catch {
      setSending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Send feedback">
      {sent ? (
        <p className="text-sm text-on-surface text-center py-4">Thanks. Feedback received.</p>
      ) : (
        <>
          <p className="text-xs text-outline mb-4">Bugs, ideas, anything that is not working for you.</p>

          <span className="label">Type</span>
          <div className="flex gap-2 mb-4">
            {["bug", "idea", "other"].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded text-xs font-semibold capitalize transition-colors ${
                  type === t ? "bg-brand text-white" : "border border-outline-variant text-on-surface hover:border-brand"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <label className="label" htmlFor="feedback-msg">Message</label>
          <textarea
            id="feedback-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="input resize-none"
            placeholder="What happened, and what did you expect?"
            autoFocus
          />

          <div className="flex items-center justify-between mt-4 mb-1.5">
            <span className="label mb-0">Screenshots (optional)</span>
            <span className="mono text-[10px] text-outline">{images.length}/{MAX_ATTACHMENTS}</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-1.5">
            {images.map((img, i) => (
              <div key={img.previewUrl} className="relative w-16 h-16 rounded overflow-hidden border border-outline-variant">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt={img.file.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  aria-label={`Remove ${img.file.name}`}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center leading-none text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
            {images.length < MAX_ATTACHMENTS && (
              <label className="w-16 h-16 rounded border border-dashed border-outline-variant flex items-center justify-center text-outline hover:border-brand hover:text-primary cursor-pointer transition-colors">
                <span className="text-lg leading-none">+</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { addImages(e.target.files); e.target.value = ""; }}
                />
              </label>
            )}
          </div>
          {imageError && <p className="text-xs text-error mb-2">{imageError}</p>}

          <div className="flex justify-end gap-2 mt-4 mb-2">
            <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
            <button onClick={send} disabled={!message.trim() || sending || isUploading} className="btn-primary text-xs">
              {sending || isUploading ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

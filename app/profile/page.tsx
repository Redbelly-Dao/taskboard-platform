"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AppShell from "@/components/AppShell";
import Link from "next/link";

export default function ProfilePage() {
  const { user, appUser, loading } = useAuth();
  const [username, setUsername] = useState(appUser?.username || "");
  const [discord, setDiscord] = useState(appUser?.discordHandle || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-deep">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const save = async () => {
    if (!appUser) return;
    setSaving(true);
    setMsg("");
    try {
      await updateDoc(doc(db, "users", appUser.uid), {
        username: username.trim() || undefined,
        discordHandle: discord.trim() || undefined,
      });
      setMsg("Saved. Refresh to see it everywhere.");
    } catch {
      setMsg("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell width="form">
      <h1 className="text-2xl font-semibold text-on-surface mb-2">Profile</h1>
      <p className="text-sm text-outline mb-4">
        Edit your display name and Discord. Your username is shown across the board instead of your raw wallet address.
      </p>

      <div className="card p-6 space-y-4">
        <div>
          <span className="label">Wallet (immutable)</span>
          <div className="mono text-sm bg-surface-container-lowest border border-surface-container-high p-2 rounded break-all text-on-surface">
            {appUser?.walletAddress}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="username">Username (unique display name)</label>
          <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="coolcontributor" />
          <p className="text-xs text-outline mt-1">Can differ from your Discord. Used across the board.</p>
        </div>

        <div>
          <label className="label" htmlFor="discord">Discord handle</label>
          <input id="discord" className="input" value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="@yourhandle" />
        </div>

        {msg && <div className="text-xs text-ok">{msg}</div>}

        <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>

      <p className="text-center mt-4 text-xs">
        <Link href="/dashboard" className="text-primary hover:underline">← Back to dashboard</Link>
      </p>
    </AppShell>
  );
}

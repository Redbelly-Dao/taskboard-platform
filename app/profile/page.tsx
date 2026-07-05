"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function ProfilePage() {
  const { user, appUser, loading } = useAuth();
  const [username, setUsername] = useState(appUser?.username || "");
  const [discord, setDiscord] = useState(appUser?.discordHandle || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const save = async () => {
    if (!appUser) return;
    setSaving(true);
    setMsg("");
    try {
      // Basic uniqueness check client (real enforcement can use rules or cloud fn)
      await updateDoc(doc(db, "users", appUser.uid), {
        username: username.trim() || undefined,
        discordHandle: discord.trim() || undefined,
      });
      setMsg("Saved! Refresh to see everywhere.");
    } catch (e) {
      setMsg("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Profile</h1>
        <p className="text-sm text-[#888888] mb-4">Edit your display name and Discord. Username is unique and shown instead of raw wallet addresses.</p>

        <div className="card p-6 space-y-4">
          <div>
            <label className="label">Wallet (immutable)</label>
            <div className="font-mono text-sm bg-[#F4F5F7] p-2 rounded">{appUser?.walletAddress}</div>
          </div>

          <div>
            <label className="label">Username (unique display name)</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="coolcontributor" />
            <p className="text-xs text-[#AAAAAA] mt-1">Can be different from your Discord. Used across the board.</p>
          </div>

          <div>
            <label className="label">Discord Handle</label>
            <input className="input" value={discord} onChange={e => setDiscord(e.target.value)} placeholder="@yourhandle" />
          </div>

          {msg && <div className="text-xs text-green-600">{msg}</div>}

          <button onClick={save} disabled={saving} className="btn-primary w-full">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>

        <p className="text-center mt-4 text-xs"><Link href="/dashboard" className="text-[#E63329]">← Back to dashboard</Link></p>
      </div>
    </div>
  );
}

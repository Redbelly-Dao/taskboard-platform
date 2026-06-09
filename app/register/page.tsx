"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState("");
  const [discord, setDiscord] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!wallet.startsWith("0x") || wallet.length < 10) {
      setError("Please enter a valid wallet address starting with 0x");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await register(wallet, password, discord);
      router.replace("/dashboard");
    } catch (err: any) {
      console.error("Registration error:", err?.code, err?.message);
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this wallet address already exists. Please sign in.");
      } else if (err.code === "auth/configuration-not-found") {
        setError("Firebase Authentication is not set up. Enable Email/Password in the Firebase Console.");
      } else if (err.code === "auth/operation-not-allowed") {
        setError("Email/Password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Network error. Check your internet connection.");
      } else {
        setError(`Registration failed: ${err?.code || err?.message || "Unknown error"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] flex flex-col">
      {/* Top bar */}
      <div className="bg-[#2C2C2C] py-2 px-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Image src="/dao-logo.png" alt="Redbelly DAO" height={24} width={35} className="object-contain brightness-0 invert" />
          <span className="text-white text-xs font-semibold tracking-wide">REDBELLY NETWORK DAO</span>
          <span className="text-white/50 text-xs">· Community Task Board</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image src="/dao-logo.png" alt="Redbelly DAO" height={52} width={77} className="object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-[#1A1A2E]">Create Account</h1>
            <p className="text-[#888888] text-sm mt-1">Register as a contributor to submit tasks</p>
          </div>

          <div className="card p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Wallet Address <span className="text-[#E63329]">*</span></label>
                <input
                  className="input font-mono"
                  type="text"
                  placeholder="0x..."
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value.trim())}
                  required
                />
                <p className="text-xs text-[#AAAAAA] mt-1">
                  This is your username. Use the wallet you will receive RBNT payments to.
                </p>
              </div>

              <div>
                <label className="label">Discord Handle <span className="text-[#AAAAAA] font-normal normal-case">(optional but recommended)</span></label>
                <input
                  className="input"
                  type="text"
                  placeholder="@yourhandle"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value.trim())}
                />
              </div>

              <div>
                <label className="label">Password <span className="text-[#E63329]">*</span></label>
                <input
                  className="input"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Confirm Password <span className="text-[#E63329]">*</span></label>
                <input
                  className="input"
                  type="password"
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-xs">{error}</p>
                </div>
              )}

              <div className="bg-[#FEF0EF] rounded-lg p-3">
                <p className="text-xs text-[#E63329] font-semibold mb-1">Before you register</p>
                <p className="text-xs text-[#555555]">
                  New accounts require admin approval before access is granted. After registering,
                  reach out in the{" "}
                  <a href="https://discord.com/channels/969088176322908160/1471738127860236424" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#E63329] hover:underline">#DAO TASKBOARD</a>
                  {" "}Discord channel so an admin can approve your account.
                </p>
              </div>

              <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : "Create Account"}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-[#E8EBF0] text-center">
              <p className="text-sm text-[#555555]">
                Already have an account?{" "}
                <Link href="/login" className="text-[#E63329] font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

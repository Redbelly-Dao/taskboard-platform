"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!wallet.startsWith("0x") || wallet.length < 10) {
      setError("Please enter a valid wallet address starting with 0x");
      return;
    }
    setLoading(true);
    try {
      await login(wallet, password);
      router.replace("/");
    } catch {
      setError("Invalid wallet address or password. Please try again.");
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
            <h1 className="text-2xl font-bold text-[#1A1A2E]">Sign In</h1>
            <p className="text-[#888888] text-sm mt-1">Access the Redbelly DAO Task Board</p>
          </div>

          <div className="card p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Wallet Address</label>
                <input
                  className="input font-mono"
                  type="text"
                  placeholder="0x..."
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value.trim())}
                  autoComplete="username"
                  required
                />
                <p className="text-xs text-[#AAAAAA] mt-1">Your Redbelly-compatible wallet address</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label" style={{ marginBottom: 0 }}>Password</label>
                  <Link href="/forgot-password" className="text-xs text-[#E63329] hover:underline font-medium">
                    Forgot password?
                  </Link>
                </div>
                <input
                  className="input"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-xs">{error}</p>
                </div>
              )}

              <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : "Sign In"}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-[#E8EBF0] text-center">
              <p className="text-sm text-[#555555]">
                New contributor?{" "}
                <Link href="/register" className="text-[#E63329] font-semibold hover:underline">
                  Create an account
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-[#AAAAAA] mt-6">
            Redbelly DAO Community Task Board · 2026
          </p>
        </div>
      </div>
    </div>
  );
}

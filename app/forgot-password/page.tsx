"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Step = "wallet" | "sign" | "password" | "done";

function buildResetMessage(wallet: string, windowTs: number) {
  return `Redbelly DAO Password Reset\nWallet: ${wallet.toLowerCase()}\nWindow: ${windowTs}`;
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("wallet");
  const [wallet, setWallet] = useState("");
  const [signature, setSignature] = useState("");
  const [signedMessage, setSignedMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateWallet = () => {
    setError("");
    if (!wallet.startsWith("0x") || wallet.length < 10) {
      setError("Please enter a valid wallet address starting with 0x");
      return;
    }
    setStep("sign");
  };

  const signMessage = async () => {
    setError("");
    setLoading(true);
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        setError("No Web3 wallet detected. Install MetaMask or another wallet extension.");
        return;
      }

      // Request accounts first to ensure wallet is connected
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const windowTs = Math.floor(Date.now() / 1000 / 300);
      const message = buildResetMessage(wallet, windowTs);

      // personal_sign — the wallet shows the human-readable message to the user
      const sig = await window.ethereum.request({
        method: "personal_sign",
        params: [message, wallet.toLowerCase()],
      });

      setSignature(sig as string);
      setSignedMessage(message);
      setStep("password");
    } catch (err: any) {
      if (err?.code === 4001) {
        setError("Signature rejected. You must sign the message to verify wallet ownership.");
      } else {
        setError("Signing failed. Make sure your wallet is connected to the correct account.");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: wallet.toLowerCase(),
          newPassword,
          message: signedMessage,
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed. Please try again.");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] flex flex-col">
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
            <h1 className="text-2xl font-bold text-[#1A1A2E]">Reset Password</h1>
            <p className="text-[#888888] text-sm mt-1">Verify wallet ownership to reset your password</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[
              { key: "wallet", label: "1. Wallet" },
              { key: "sign", label: "2. Sign" },
              { key: "password", label: "3. Password" },
            ].map(({ key, label }) => {
              const steps: Step[] = ["wallet", "sign", "password", "done"];
              const current = steps.indexOf(step);
              const idx = steps.indexOf(key as Step);
              const isActive = idx === current;
              const isDone = idx < current || step === "done";
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    isDone ? "bg-green-100 text-green-700" :
                    isActive ? "bg-[#E63329] text-white" :
                    "bg-[#E8EBF0] text-[#888888]"
                  }`}>
                    {isDone && <span>✓</span>}
                    {label}
                  </div>
                  {key !== "password" && <span className="text-[#AAAAAA] text-xs">→</span>}
                </div>
              );
            })}
          </div>

          <div className="card p-6">
            {/* Step 1: Enter wallet */}
            {step === "wallet" && (
              <div className="space-y-4">
                <div>
                  <label className="label">Wallet Address</label>
                  <input
                    className="input font-mono"
                    type="text"
                    placeholder="0x..."
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value.trim())}
                    autoFocus
                  />
                  <p className="text-xs text-[#AAAAAA] mt-1">Enter the wallet address you registered with</p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-xs">{error}</p>
                  </div>
                )}

                <button onClick={validateWallet} className="btn-primary w-full justify-center">
                  Continue
                </button>
              </div>
            )}

            {/* Step 2: Sign with wallet */}
            {step === "sign" && (
              <div className="space-y-4">
                <div className="bg-[#F4F5F7] rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-[#1A1A2E]">Wallet to verify</p>
                  <p className="text-xs font-mono text-[#555555] break-all">{wallet}</p>
                </div>

                <div className="bg-[#FEF0EF] rounded-lg p-4">
                  <p className="text-xs font-semibold text-[#E63329] mb-2">What happens when you click Sign</p>
                  <ol className="text-xs text-[#555555] space-y-1 list-decimal list-inside">
                    <li>Your wallet extension will open</li>
                    <li>You'll see a human-readable message (no transaction, no gas)</li>
                    <li>Signing proves you own this wallet address</li>
                    <li>The signature expires in 10 minutes — use it now</li>
                  </ol>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-xs">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={signMessage} disabled={loading} className="btn-primary flex-1 justify-center">
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Waiting for signature…
                      </>
                    ) : "Sign with Wallet"}
                  </button>
                  <button onClick={() => { setStep("wallet"); setError(""); }} className="btn-secondary">
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: New password */}
            {step === "password" && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700">Wallet verified</p>
                  <p className="text-xs text-green-600 font-mono mt-0.5">{wallet.slice(0, 10)}…{wallet.slice(-6)}</p>
                </div>

                <div>
                  <label className="label">New Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label">Confirm New Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Repeat your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-xs">{error}</p>
                  </div>
                )}

                <button onClick={resetPassword} disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Resetting password…
                    </>
                  ) : "Reset Password"}
                </button>
              </div>
            )}

            {/* Step 4: Done */}
            {step === "done" && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-3xl text-green-600">✓</span>
                </div>
                <div>
                  <p className="font-bold text-[#1A1A2E] text-lg">Password reset</p>
                  <p className="text-sm text-[#888888] mt-1">You can now sign in with your new password.</p>
                </div>
                <Link href="/login" className="btn-primary w-full justify-center inline-flex">
                  Sign In
                </Link>
              </div>
            )}
          </div>

          {step !== "done" && (
            <div className="mt-4 text-center">
              <Link href="/login" className="text-xs text-[#888888] hover:text-[#E63329] transition-colors">
                ← Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

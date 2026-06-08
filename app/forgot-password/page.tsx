"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

type Step = "wallet" | "sign" | "password" | "done";

interface DetectedWallet {
  name: string;
  icon: string;
  provider: NonNullable<Window["ethereum"]>;
}

function buildResetMessage(wallet: string, windowTs: number) {
  return `Redbelly DAO Password Reset\nWallet: ${wallet.toLowerCase()}\nWindow: ${windowTs}`;
}

function detectWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const found: DetectedWallet[] = [];
  const seenNames = new Set<string>();

  const add = (name: string, icon: string, provider: NonNullable<Window["ethereum"]>) => {
    if (!seenNames.has(name)) {
      seenNames.add(name);
      found.push({ name, icon, provider });
    }
  };

  // OKX has its own namespace; always check it first so it's never missed
  if (window.okxwallet) {
    add("OKX Wallet", "okx", window.okxwallet);
  }

  // Coinbase Wallet extension
  if (window.coinbaseWalletExtension) {
    add("Coinbase Wallet", "coinbase", window.coinbaseWalletExtension);
  }

  if (window.ethereum) {
    // Some setups expose multiple providers in an array
    const providers = window.ethereum.providers ?? [window.ethereum];

    for (const p of providers) {
      if ((p.isOKExWallet || p.isOkxWallet) && !seenNames.has("OKX Wallet")) {
        add("OKX Wallet", "okx", p);
      } else if (p.isCoinbaseWallet && !seenNames.has("Coinbase Wallet")) {
        add("Coinbase Wallet", "coinbase", p);
      } else if (p.isBraveWallet) {
        add("Brave Wallet", "brave", p);
      } else if (p.isRabby) {
        add("Rabby Wallet", "rabby", p);
      } else if (p.isTrust) {
        add("Trust Wallet", "trust", p);
      } else if (p.isMetaMask) {
        add("MetaMask", "metamask", p);
      } else if (!p.isOKExWallet && !p.isOkxWallet && !p.isCoinbaseWallet) {
        // Generic injected provider (e.g. frame.sh, rainbow as injected, etc.)
        add("Browser Wallet", "generic", p);
      }
    }
  }

  return found;
}

function WalletIcon({ type, size = 32 }: { type: string; size?: number }) {
  const s = size;
  // Simple SVG icons for common wallets; generic fallback for others
  if (type === "metamask") return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#F6851B"/>
      <path d="M27 5L17.5 12l1.8-4.3L27 5z" fill="#E17726"/>
      <path d="M5 5l9.4 7.1-1.7-4.4L5 5z" fill="#E27625"/>
      <path d="M23.4 22.4l-2.6 4 5.5 1.5 1.6-5.4-4.5-.1zM4.1 22.5l1.5 5.4 5.5-1.5-2.6-4-4.4.1z" fill="#E27625"/>
      <path d="M10.8 14.3l-1.5 2.3 5.4.2-.2-5.8-3.7 3.3zM21.2 14.3l-3.8-3.4-.1 5.9 5.4-.2-1.5-2.3z" fill="#E27625"/>
      <path d="M11.1 26.4l3.2-1.6-2.8-2.2-.4 3.8zM17.7 24.8l3.2 1.6-.4-3.8-2.8 2.2z" fill="#E27625"/>
    </svg>
  );

  if (type === "okx") return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#000"/>
      <path d="M13 9h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4z" fill="white"/>
      <rect x="10" y="14" width="4" height="4" fill="black"/>
      <rect x="18" y="14" width="4" height="4" fill="black"/>
    </svg>
  );

  if (type === "coinbase") return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#1652F0"/>
      <circle cx="16" cy="16" r="9" fill="white"/>
      <circle cx="16" cy="16" r="6" fill="#1652F0"/>
      <rect x="13" y="14.5" width="6" height="3" rx="1.5" fill="white"/>
    </svg>
  );

  if (type === "brave") return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#FB542B"/>
      <path d="M16 6l7 4.5-2 11-5 4.5-5-4.5-2-11L16 6z" fill="white" fillOpacity=".9"/>
    </svg>
  );

  // Generic / trust / rabby fallback
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#E8EBF0"/>
      <circle cx="16" cy="14" r="5" fill="#888"/>
      <path d="M7 26c0-5 4-8 9-8s9 3 9 8" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
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

  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<DetectedWallet | null>(null);

  useEffect(() => {
    // Wallets inject after a tick; detect on step change to sign
    if (step === "sign") {
      const found = detectWallets();
      setDetectedWallets(found);
      if (found.length === 1) setSelectedWallet(found[0]);
    }
  }, [step]);

  const validateWallet = () => {
    setError("");
    if (!wallet.startsWith("0x") || wallet.length < 10) {
      setError("Please enter a valid wallet address starting with 0x");
      return;
    }
    setStep("sign");
  };

  const signWithProvider = async (walletEntry: DetectedWallet) => {
    setError("");
    setLoading(true);
    setShowPicker(false);
    setSelectedWallet(walletEntry);
    try {
      await walletEntry.provider.request({ method: "eth_requestAccounts" });

      const windowTs = Math.floor(Date.now() / 1000 / 300);
      const message = buildResetMessage(wallet, windowTs);

      const sig = await walletEntry.provider.request({
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
        setError(`Signing failed: ${err?.message || "Make sure your wallet is connected to the correct account."}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnectOrSign = () => {
    if (detectedWallets.length === 0) {
      setError("No EVM wallet detected. Install MetaMask, OKX Wallet, or another browser wallet.");
      return;
    }
    if (detectedWallets.length === 1) {
      signWithProvider(detectedWallets[0]);
      return;
    }
    setShowPicker(true);
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
            <h1 className="text-2xl font-bold text-[#1A1A2E]">Reset Password</h1>
            <p className="text-[#888888] text-sm mt-1">Verify wallet ownership to reset your password</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[
              { key: "wallet", label: "1. Wallet" },
              { key: "sign",   label: "2. Sign" },
              { key: "password", label: "3. Password" },
            ].map(({ key, label }) => {
              const steps: Step[] = ["wallet", "sign", "password", "done"];
              const current = steps.indexOf(step);
              const idx = steps.indexOf(key as Step);
              const isDone = idx < current || step === "done";
              const isActive = idx === current;
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
            {/* Step 1 */}
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
                {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-red-700 text-xs">{error}</p></div>}
                <button onClick={validateWallet} className="btn-primary w-full justify-center">Continue</button>
              </div>
            )}

            {/* Step 2 */}
            {step === "sign" && (
              <div className="space-y-4">
                <div className="bg-[#F4F5F7] rounded-lg p-4 space-y-1">
                  <p className="text-xs font-semibold text-[#1A1A2E]">Verifying ownership of</p>
                  <p className="text-xs font-mono text-[#555555] break-all">{wallet}</p>
                </div>

                <div className="bg-[#FEF0EF] rounded-lg p-4">
                  <p className="text-xs font-semibold text-[#E63329] mb-2">How this works</p>
                  <ol className="text-xs text-[#555555] space-y-1 list-decimal list-inside">
                    <li>Select your wallet from the list below</li>
                    <li>Your wallet will show a human-readable message to sign</li>
                    <li>No transaction, no gas: just a cryptographic proof</li>
                    <li>Signature expires in 10 minutes</li>
                  </ol>
                </div>

                {/* Detected wallets list */}
                {detectedWallets.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#888888] uppercase tracking-wider">Detected wallets</p>
                    {detectedWallets.map((w) => (
                      <button
                        key={w.name}
                        onClick={() => signWithProvider(w)}
                        disabled={loading}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                          selectedWallet?.name === w.name && loading
                            ? "border-[#E63329] bg-[#FEF0EF]"
                            : "border-[#E8EBF0] bg-white hover:border-[#E63329] hover:shadow-sm"
                        }`}
                      >
                        <WalletIcon type={w.icon} size={36} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[#1A1A2E]">{w.name}</p>
                          <p className="text-xs text-[#888888]">Click to sign</p>
                        </div>
                        {selectedWallet?.name === w.name && loading ? (
                          <span className="w-5 h-5 border-2 border-[#E63329] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="text-[#AAAAAA] text-sm">→</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-[#E8EBF0] p-6 text-center">
                    <p className="text-sm text-[#888888] font-semibold">No wallet detected</p>
                    <p className="text-xs text-[#AAAAAA] mt-1">Install MetaMask, OKX Wallet, Coinbase Wallet, or another EVM browser extension</p>
                  </div>
                )}

                {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-red-700 text-xs">{error}</p></div>}

                <button onClick={() => { setStep("wallet"); setError(""); }} className="btn-secondary w-full justify-center">
                  ← Back
                </button>
              </div>
            )}

            {/* Step 3 */}
            {step === "password" && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                  {selectedWallet && <WalletIcon type={selectedWallet.icon} size={28} />}
                  <div>
                    <p className="text-xs font-semibold text-green-700">Wallet verified via {selectedWallet?.name}</p>
                    <p className="text-xs text-green-600 font-mono">{wallet.slice(0, 10)}…{wallet.slice(-6)}</p>
                  </div>
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input className="input" type="password" placeholder="Minimum 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input className="input" type="password" placeholder="Repeat your new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-red-700 text-xs">{error}</p></div>}
                <button onClick={resetPassword} disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Resetting password…</>
                  ) : "Reset Password"}
                </button>
              </div>
            )}

            {/* Done */}
            {step === "done" && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-3xl text-green-600">✓</span>
                </div>
                <div>
                  <p className="font-bold text-[#1A1A2E] text-lg">Password reset</p>
                  <p className="text-sm text-[#888888] mt-1">You can now sign in with your new password.</p>
                </div>
                <Link href="/login" className="btn-primary w-full justify-center inline-flex">Sign In</Link>
              </div>
            )}
          </div>

          {step !== "done" && (
            <div className="mt-4 text-center">
              <Link href="/login" className="text-xs text-[#888888] hover:text-[#E63329] transition-colors">← Back to sign in</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

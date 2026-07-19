"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Connector } from "wagmi";
import { useAuth } from "@/lib/auth-context";
import { useWalletConnectors } from "@/lib/use-wallet-connect";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const { walletLogin } = useAuth();
  const router = useRouter();
  const { connectors, connectAndSign } = useWalletConnectors();
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleConnect = async (connector: Connector) => {
    setError("");
    setPendingId(connector.uid);
    try {
      const { address, signature, message } = await connectAndSign(connector);
      await walletLogin(address, signature, message);
      router.replace("/");
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setError(e?.shortMessage || e?.message || "Login failed. Please sign the message with your wallet.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background-deep flex flex-col">
      {/* Top bar */}
      <div className="page-header py-2 px-4">
        <div className="max-w-[1280px] mx-auto flex items-center gap-3">
          <Logo height={24} width={35} />
          <span className="mono text-on-surface text-xs font-bold tracking-widest uppercase">Redbelly Network DAO</span>
          <span className="text-outline text-xs hidden sm:inline">· Community Task Board</span>
          <span className="ml-auto"><ThemeToggle /></span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo height={52} width={77} />
            </div>
            <h1 className="text-2xl font-semibold text-on-surface">Sign in</h1>
            <p className="text-outline text-sm mt-1">Access the Redbelly DAO Task Board</p>
          </div>

          <div className="card card-lg p-6">
            <div className="space-y-4">
              {connectors.length === 0 ? (
                <div className="border border-outline-variant rounded p-4 text-center">
                  <p className="text-sm text-on-surface font-medium">No wallet detected</p>
                  <p className="text-xs text-outline mt-1">
                    Install a browser wallet such as{" "}
                    <a href="https://www.okx.com/web3" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OKX</a>,{" "}
                    <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">MetaMask</a>, or Coinbase Wallet, then refresh this page.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-outline text-center mb-1">Choose a wallet to connect and sign in</p>
                  {connectors.map((connector) => {
                    const pending = pendingId === connector.uid;
                    return (
                      <button
                        key={connector.uid}
                        onClick={() => handleConnect(connector)}
                        disabled={pendingId !== null}
                        className="btn-primary w-full justify-center py-3 text-base disabled:opacity-60"
                      >
                        {pending ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Signing in…
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            {connector.icon && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={connector.icon} alt="" className="w-5 h-5 rounded" />
                            )}
                            Continue with {connector.name}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="text-center text-xs text-outline leading-relaxed">
                KYC is required to access the Redbelly Network.<br />
                <a
                  href="https://access.redbelly.network/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-primary hover:underline"
                >
                  access.redbelly.network
                </a>
              </div>

              {error && (
                <div className="border border-error rounded p-3">
                  <p className="text-error text-xs text-center">{error}</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-surface-container-high text-center">
              <p className="text-sm text-outline">
                New contributor?{" "}
                <Link href="/register" className="text-primary font-semibold hover:underline">
                  Create an account
                </Link>
              </p>
            </div>
          </div>

          <p className="mono text-center text-[10px] text-outline mt-6 uppercase tracking-widest">
            Redbelly DAO Community Task Board · 2026
          </p>
          <p className="text-center text-xs mt-3">
            <Link href="/ledger" className="text-outline hover:text-primary hover:underline">View the public transparency ledger →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

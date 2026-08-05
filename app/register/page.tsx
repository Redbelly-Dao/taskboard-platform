"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Connector } from "wagmi";
import { useAuth, describeAuthError } from "@/lib/auth-context";
import { useWalletConnectors } from "@/lib/use-wallet-connect";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import { RIGHTS_VERSION } from "@/lib/rights";

export default function RegisterPage() {
  const { walletRegister } = useAuth();
  const router = useRouter();
  const { connectors, connectAndSign } = useWalletConnectors();
  const [discord, setDiscord] = useState("");
  const [username, setUsername] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  // The connect buttons stay disabled until the form above is complete. Nothing used to say so, so a dead button
  // reads as a wallet fault and people start reconnecting wallets to fix a form problem.
  const missing = [
    !discord.trim() && "a Discord handle",
    !username.trim() && "a username",
    !acceptedTerms && "your acceptance of the Terms",
  ].filter(Boolean) as string[];
  const missingLabel =
    missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}` : missing[0];

  const handleRegister = async (connector: Connector) => {
    setError("");
    if (!discord.trim() || !username.trim()) {
      setError("Enter both a Discord handle and a username before connecting your wallet.");
      return;
    }
    // T&Cs cl 8.2. The wallet signature at submission proves a wallet signed one task's agreement;
    // this ties the person to the complete Terms before they ever open a task.
    if (!acceptedTerms) {
      setError("Accept the participation Terms and Conditions before connecting your wallet.");
      return;
    }
    setPendingId(connector.uid);
    try {
      const { address, signature, message } = await connectAndSign(connector);
      await walletRegister(address, signature, message, discord, username, RIGHTS_VERSION);
      router.replace("/dashboard");
    } catch (err: unknown) {
      console.error("Wallet register error:", err);
      setError(describeAuthError(err, "register"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background-deep flex flex-col">
      {/* Top bar */}
      <div className="page-header py-2 px-4">
        <div className="max-w-[1280px] mx-auto flex items-center gap-3">
          <Logo height={30} />
          <span className="mono text-on-surface text-xs font-bold tracking-widest uppercase">Redbelly Network DAO</span>
          <span className="text-outline text-xs hidden sm:inline">· Community Task Board</span>
          <span className="ml-auto"><ThemeToggle /></span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo height={84} />
            </div>
            <h1 className="text-2xl font-semibold text-on-surface">Create account</h1>
            <p className="text-outline text-sm mt-1">Register as a contributor to submit tasks</p>
          </div>

          <div className="card card-lg p-6">
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="discord">Discord handle <span className="text-brand">*</span></label>
                <input
                  id="discord"
                  className="input"
                  type="text"
                  placeholder="@yourhandle"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value.trim())}
                />
              </div>

              <div>
                <label className="label" htmlFor="username">Username <span className="text-brand">*</span> <span className="text-outline font-normal normal-case">(unique, can differ from Discord)</span></label>
                <input
                  id="username"
                  className="input mono"
                  type="text"
                  placeholder="coolbuilder"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                />
                <p className="text-xs text-outline mt-1">Shown instead of your wallet on cards and tables. Must be unique.</p>
              </div>

              <div className="border-l-2 border-brand bg-surface-container-low rounded-r p-3">
                <p className="text-xs text-primary font-semibold mb-1">Before you register</p>
                <p className="text-xs text-outline leading-relaxed">
                  All new accounts are Contributors. Reviewer and Administrator roles are assigned by admins after
                  vetting. Reach out in the{" "}
                  {/* Server invite, not the channel deep link. This page is read by people who have not joined yet,
                      and a deep link only resolves for existing members. */}
                  <a href="https://discord.gg/YMpArA2Y8j" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">#DAO TASKBOARD</a>
                  {" "}channel after registering.
                  <br />
                  You must complete KYC at{" "}
                  <a href="https://access.redbelly.network/" target="_blank" rel="noopener noreferrer" className="mono text-primary hover:underline">access.redbelly.network</a>{" "}
                  to use the Redbelly Network.
                </p>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 shrink-0 accent-[var(--brand)]"
                />
                <span className="text-xs text-on-surface leading-relaxed">
                  I have read and accept the{" "}
                  <Link href="/terms" target="_blank" className="text-primary font-semibold hover:underline">participation Terms and Conditions</Link>
                  {" "}(version <span className="mono">{RIGHTS_VERSION}</span>) and the{" "}
                  <Link href="/rules" target="_blank" className="text-primary font-semibold hover:underline">Task Board Rulebook</Link>.
                  If a submission of mine is selected and paid, the rights in that work transfer to Redbelly Network Pty Ltd.
                </span>
              </label>

              <div>
                <label className="label">Connect wallet to register <span className="text-brand">*</span></label>
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
                    {connectors.map((connector) => {
                      const pending = pendingId === connector.uid;
                      return (
                        <button
                          key={connector.uid}
                          onClick={() => handleRegister(connector)}
                          disabled={pendingId !== null || !discord.trim() || !username.trim() || !acceptedTerms}
                          className="btn-primary w-full justify-center disabled:opacity-60"
                        >
                          {pending ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Creating account...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              {connector.icon && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={connector.icon} alt="" className="w-5 h-5 rounded" />
                              )}
                              Register with {connector.name}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-outline mt-1">
                  {missing.length > 0
                    ? `Add ${missingLabel} above to enable these buttons.`
                    : "Sign a message with your wallet to create your account. No password required."}
                </p>
              </div>

              {error && (
                <div className="border border-error rounded p-3">
                  <p className="text-error text-xs">{error}</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-surface-container-high text-center">
              <p className="text-sm text-outline">
                Already have an account?{" "}
                <Link href="/login" className="text-primary font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

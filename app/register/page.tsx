"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { createWalletClient, custom, type Address } from 'viem';
import { redbelly } from '@/lib/redbelly';

export default function RegisterPage() {
  const { walletRegister } = useAuth();
  const router = useRouter();
  const [discord, setDiscord] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleWalletRegister = async () => {
    setError("");
    if (typeof window === 'undefined' || !window.ethereum) {
      setError("No wallet detected. Install MetaMask or similar.");
      return;
    }

    setLoading(true);
    try {
      const client = createWalletClient({
        chain: redbelly,
        transport: custom(window.ethereum),
      });

      // Ensure wallet is on Redbelly Network (chainId 151)
      const chainIdHex = '0x' + redbelly.id.toString(16);
      try {
        await (window.ethereum as any).request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await (window.ethereum as any).request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainIdHex,
              chainName: redbelly.name,
              nativeCurrency: redbelly.nativeCurrency,
              rpcUrls: redbelly.rpcUrls.default.http,
              blockExplorerUrls: [redbelly.blockExplorers.default.url],
            }],
          });
          await (window.ethereum as any).request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
        } else {
          throw switchError;
        }
      }

      const [address] = await client.request({
        method: 'eth_requestAccounts',
      }) as Address[];

      const windowTs = Math.floor(Date.now() / 1000 / 300);
      const message = `Sign in to Redbelly DAO Task Board\nWallet: ${address.toLowerCase()}\nWindow: ${windowTs}`;

      const signature = await client.signMessage({
        account: address,
        message,
      });

      await walletRegister(address, signature, message, discord, username);
      router.replace("/dashboard");
    } catch (err: any) {
      console.error("Wallet register error:", err);
      setError(err.message || "Registration failed. Please sign the message.");
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
            <div className="space-y-4">
              <div>
                <label className="label">Connect Wallet <span className="text-[#E63329]">*</span></label>
                <button
                  onClick={handleWalletRegister}
                  disabled={loading}
                  className="btn-primary w-full justify-center"
                >
                  Connect Wallet & Sign to Register
                </button>
                <p className="text-xs text-[#AAAAAA] mt-1">
                  Use your wallet to register. No password required.
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
                <label className="label">Username (unique, for display - can differ from Discord)</label>
                <input
                  className="input font-mono"
                  type="text"
                  placeholder="coolbuilder"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                />
                <p className="text-xs text-[#AAAAAA] mt-1">Shown instead of wallet on cards & tables. Must be unique.</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-xs">{error}</p>
                </div>
              )}

              <div className="bg-[#FEF0EF] rounded-lg p-3">
                <p className="text-xs text-[#E63329] font-semibold mb-1">Before you register</p>
                <p className="text-xs text-[#555555]">
                  All new accounts are registered as Contributors. Reviewer and Administrator roles
                  are assigned by admins after vetting. Reach out in the{" "}
                  <a href="https://discord.com/channels/969088176322908160/1471738127860236424" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#E63329] hover:underline">#DAO TASKBOARD</a>
                  {" "}channel on Discord after registering.
                  <br />
                  Note: You must complete KYC at{" "}
                  <a href="https://access.redbelly.network/" target="_blank" rel="noopener noreferrer" className="underline">https://access.redbelly.network/</a>{" "}
                  to use the Redbelly Network.
                </p>
              </div>

              <button onClick={handleWalletRegister} disabled={loading} className="btn-primary w-full justify-center">
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : "Connect Wallet & Sign to Register"}
              </button>
            </div>

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

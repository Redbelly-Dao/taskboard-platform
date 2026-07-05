"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { createWalletClient, custom, type Address } from 'viem';
import { redbelly } from '@/lib/redbelly';

export default function LoginPage() {
  const { walletLogin } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleWalletLogin = async () => {
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

      await walletLogin(address, signature, message);
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Login failed. Please sign the message with your wallet.");
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
            <div className="space-y-5">
              <button
                onClick={handleWalletLogin}
                disabled={loading}
                className="btn-primary w-full justify-center py-3 text-base"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  "Connect Wallet & Sign In"
                )}
              </button>

              <p className="text-center text-xs text-[#888888]">
                Sign in securely with your wallet.
              </p>

              <div className="text-center text-xs text-[#666666] leading-tight">
                KYC is required to access the Redbelly Network.<br />
                <a
                  href="https://access.redbelly.network/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#E63329] hover:underline"
                >
                  https://access.redbelly.network/
                </a>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-xs text-center">{error}</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-[#E8EBF0] text-center">
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

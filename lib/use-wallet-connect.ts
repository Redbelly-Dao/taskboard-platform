"use client";

import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { redbelly } from "./redbelly";

export interface WalletAuthResult {
  address: string;
  signature: string;
  message: string;
}

/**
 * Shared wallet connect + sign flow for the login and register pages.
 * Returns the list of available wallet connectors (EIP-6963 discovered plus the
 * injected fallback) and a `connectAndSign` action that connects the chosen
 * wallet, ensures it is on Redbelly, and signs the standard auth message.
 */
export function useWalletConnectors() {
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { isConnected } = useAccount();

  // EIP-6963 discovery plus the fallback injected() connector can produce a
  // duplicate generic "Injected" entry. Hide it when named wallets exist, then
  // dedupe by display name.
  const named = connectors.filter((c) => c.name !== "Injected");
  const base = named.length > 0 ? named : connectors;
  const seen = new Set<string>();
  const list = base.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const connectAndSign = async (connector: Connector): Promise<WalletAuthResult> => {
    // Start clean so re-connecting the same wallet never throws
    // "connector already connected".
    if (isConnected) {
      try {
        await disconnectAsync();
      } catch {
        /* ignore */
      }
    }

    const { accounts, chainId } = await connectAsync({ connector, chainId: redbelly.id });
    const address = accounts[0];
    if (!address) throw new Error("No account returned from wallet.");

    // wagmi adds/switches to Redbelly during connect when the wallet allows it;
    // ensure it, but don't hard-fail if the wallet rejects the switch.
    if (chainId !== redbelly.id) {
      try {
        await switchChainAsync({ connector, chainId: redbelly.id });
      } catch {
        /* the signature still binds to the address regardless of chain */
      }
    }

    const windowTs = Math.floor(Date.now() / 1000 / 300);
    const message = `Sign in to Redbelly DAO Task Board\nWallet: ${address.toLowerCase()}\nWindow: ${windowTs}`;
    const signature = await signMessageAsync({ account: address, message });

    return { address, signature, message };
  };

  return { connectors: list, connectAndSign };
}

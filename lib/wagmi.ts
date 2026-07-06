import { createConfig, http } from "wagmi";
// Import from the direct subpath, not the "wagmi/connectors" barrel (the barrel
// pulls in every connector (porto, tempo, ...) whose optional deps aren't installed
// and break the production build).
import { injected } from "wagmi/connectors/injected";
import { redbelly } from "./redbelly";

// wagmi config for the app. `multiInjectedProviderDiscovery` (EIP-6963, on by
// default) means every installed browser wallet (OKX, MetaMask, Coinbase,
// Rabby, ...) announces itself and appears as its own connector, so no manual
// window.ethereum / window.okxwallet detection needed. The bare injected()
// connector is a fallback for older wallets that don't support EIP-6963.
export const wagmiConfig = createConfig({
  chains: [redbelly],
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  transports: {
    [redbelly.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

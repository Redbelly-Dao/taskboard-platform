interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isOKExWallet?: boolean;
  isOkxWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isBraveWallet?: boolean;
  isRabby?: boolean;
  providers?: EthereumProvider[];
}

interface Window {
  ethereum?: EthereumProvider;
  okxwallet?: EthereumProvider;
  coinbaseWalletExtension?: EthereumProvider;
}

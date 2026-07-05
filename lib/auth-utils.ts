import { recoverMessageAddress } from 'viem';

export const walletToEmail = (wallet: string) =>
  `${wallet.toLowerCase()}@redbelly-taskboard.dao`;

export function buildResetMessage(wallet: string, windowTs: number) {
  return `Redbelly DAO Password Reset\nWallet: ${wallet.toLowerCase()}\nWindow: ${windowTs}`;
}

export function buildAuthMessage(wallet: string, windowTs: number) {
  return `Sign in to Redbelly DAO Task Board\nWallet: ${wallet.toLowerCase()}\nWindow: ${windowTs}`;
}

export async function verifyWalletSignature(message: string, signature: string, expectedWallet: string): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({
      message: message as `0x${string}` | { raw: `0x${string}` },
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === expectedWallet.toLowerCase();
  } catch {
    return false;
  }
}

import { defineChain } from 'viem'

export const redbelly = defineChain({
  id: 151,
  name: 'Redbelly Network Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Redbelly Network Token',
    symbol: 'RBNT',
  },
  rpcUrls: {
    default: {
      http: ['https://governors.mainnet.redbelly.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Redbelly Explorer',
      url: 'https://redbelly.routescan.io',
    },
  },
})

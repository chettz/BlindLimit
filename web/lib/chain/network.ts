import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";

export const localForkChain = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export function appChain(rpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? "") {
  const local = rpc.includes("127.0.0.1") || rpc.includes("localhost");
  return local ? localForkChain : baseSepolia;
}

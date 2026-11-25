import { isAddress, type Address } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { baseSepolia } from "viem/chains";

import { appChain, localForkChain } from "./network";

export function getConfig() {
  const rpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  const local = (rpc ?? "").includes("127.0.0.1") || (rpc ?? "").includes("localhost");
  const chain = appChain(rpc);
  const localRpc = rpc?.includes("127.0.0.1") || rpc?.includes("localhost") ? rpc || "http://127.0.0.1:8545" : "http://127.0.0.1:8545";
  const sepoliaRpc = rpc && !local ? rpc : undefined;
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    transports: {
      [localForkChain.id]: http(localRpc),
      [baseSepolia.id]: http(sepoliaRpc),
    },
  });
}

export const poolAddress = asAddress(process.env.NEXT_PUBLIC_POOL_ADDRESS);
export const usdcAddress = asAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS);
export const factoryAddress = asAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS);
export const oracleAddress = asAddress(process.env.NEXT_PUBLIC_ORACLE_ADDRESS);

function asAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined;
}

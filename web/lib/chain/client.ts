import "server-only";

import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const chain = baseSepolia;

export function getPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });
}

/// 오라클 키로 서명하는 서버 지갑. 한도 게시에 쓴다.
export function getOracleWalletClient() {
  return createWalletClient({
    account: privateKeyToAccount(oracleKey()),
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });
}

export function chainAddresses() {
  return {
    registry: requiredAddress("REGISTRY_ADDRESS"),
    poolA: requiredAddress("POOL_A_ADDRESS"),
    poolB: optionalAddress("POOL_B_ADDRESS"),
    usdc: requiredAddress("USDC_ADDRESS"),
  };
}

function rpcUrl(): string {
  const url = process.env.BASE_SEPOLIA_RPC_URL;
  if (!url) throw new Error("BASE_SEPOLIA_RPC_URL 이 없습니다");
  return url;
}

function oracleKey(): Hex {
  const key = process.env.ORACLE_PRIVATE_KEY;
  if (!key?.startsWith("0x")) throw new Error("ORACLE_PRIVATE_KEY 가 없습니다");
  return key as Hex;
}

function requiredAddress(name: string): Address {
  const value = process.env[name];
  if (!value?.startsWith("0x")) throw new Error(`${name} 가 없습니다`);
  return value as Address;
}

function optionalAddress(name: string): Address | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (!value.startsWith("0x")) throw new Error(`${name} 가 없습니다`);
  return value as Address;
}

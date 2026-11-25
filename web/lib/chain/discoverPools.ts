import type { Address, PublicClient } from "viem";

import { eventArgs, getContractEventsChunked } from "./logScan";
import { poolFactoryAbi } from "./poolFactoryAbi";
import { configuredPoolOptions } from "./pools";

export type PoolListItem = {
  address: Address;
  label?: string;
};

export async function discoverPoolAddresses(client: PublicClient, factory: Address | undefined): Promise<PoolListItem[]> {
  const byKey = new Map<string, PoolListItem>();

  for (const row of configuredPoolOptions()) {
    byKey.set(row.address.toLowerCase(), { address: row.address, label: row.label });
  }

  try {
    const response = await fetch("/api/pools");
    if (response.ok) {
      const json: unknown = await response.json();
      if (json && typeof json === "object" && Array.isArray((json as { pools?: unknown }).pools)) {
        for (const row of (json as { pools: { address: string }[] }).pools) {
          if (row.address && byKey.has(row.address.toLowerCase()) === false) {
            byKey.set(row.address.toLowerCase(), { address: row.address as Address });
          }
        }
      }
    }
  } catch {
    // 서버 풀 목록 없으면 체인 조회만
  }

  if (factory) {
    try {
      const logs = await getContractEventsChunked(client, {
        address: factory,
        abi: poolFactoryAbi,
        eventName: "PoolCreated",
      });
      for (const log of logs) {
        const pool = eventArgs<{ pool?: Address }>(log)?.pool;
        if (!pool) continue;
        const key = pool.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { address: pool });
      }
    } catch {
      // 로그 조회 실패 시 env·등록 목록만
    }
  }

  return [...byKey.values()].sort((a, b) => a.address.localeCompare(b.address));
}
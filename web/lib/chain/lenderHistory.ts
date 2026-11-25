import type { Address, Hex, PublicClient } from "viem";

import { loanPoolAbi } from "./abi";
import { discoverPoolAddresses } from "./discoverPools";
import { eventArgs, getContractEventsChunked } from "./logScan";

export type CollateralPostRow = {
  pool: Address;
  txHash: Hex;
  newLimit: bigint;
  eligibleCount: bigint;
  timestamp: bigint;
};

export async function listCollateralPosts(
  client: PublicClient,
  lender: Address,
  factory: Address | undefined,
): Promise<CollateralPostRow[]> {
  const pools = await discoverPoolAddresses(client, factory);
  const key = lender.toLowerCase();
  const mine: Address[] = [];

  for (const row of pools) {
    try {
      const who = await client.readContract({ address: row.address, abi: loanPoolAbi, functionName: "lender" });
      if (who.toLowerCase() === key) mine.push(row.address);
    } catch {
      continue;
    }
  }

  const out: CollateralPostRow[] = [];
  for (const pool of mine) {
    try {
      const logs = await getContractEventsChunked(client, {
        address: pool,
        abi: loanPoolAbi,
        eventName: "LimitUpdated",
      });
      for (const log of logs) {
        const args = eventArgs<{
          newLimit?: bigint;
          eligibleCount?: bigint;
          timestamp?: bigint;
        }>(log);
        if (!args || log.transactionHash === null) continue;
        if (args.newLimit === undefined || args.eligibleCount === undefined || args.timestamp === undefined) continue;
        out.push({
          pool,
          txHash: log.transactionHash,
          newLimit: args.newLimit,
          eligibleCount: args.eligibleCount,
          timestamp: args.timestamp,
        });
      }
    } catch {
      continue;
    }
  }

  return out.sort((a, b) => Number(b.timestamp - a.timestamp));
}
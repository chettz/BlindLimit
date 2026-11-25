import type { BlockNumber, PublicClient } from "viem";

// shortcut: Alchemy free fork caps eth_getLogs to 10 blocks, widen only if RPC allows
const CHUNK = 9n;

type GetEventsParams = Parameters<PublicClient["getContractEvents"]>[0];
type GetEventsResult = Awaited<ReturnType<PublicClient["getContractEvents"]>>;

export async function getContractEventsChunked(
  client: PublicClient,
  params: Omit<GetEventsParams, "fromBlock" | "toBlock">,
  lookback = 20_000n,
): Promise<GetEventsResult> {
  const latest = await client.getBlockNumber();
  const start: BlockNumber = latest > lookback ? latest - lookback : 0n;
  const rows = [] as GetEventsResult;
  let to = latest;

  while (to >= start) {
    const from: BlockNumber = to > start + CHUNK ? to - CHUNK : start;
    const batch = await client.getContractEvents({
      ...params,
      fromBlock: from,
      toBlock: to,
    } as GetEventsParams);
    rows.push(...batch);
    if (from <= start) break;
    to = from - 1n;
  }

  return rows;
}

export function eventArgs<T extends Record<string, unknown>>(log: GetEventsResult[number]): T | undefined {
  if (!log || typeof log !== "object" || !("args" in log)) return undefined;
  return (log as { args?: T }).args;
}
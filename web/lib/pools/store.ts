import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAddress, isAddress, type Address, type Hex } from "viem";

export type PoolRecord = {
  address: Address;
  registeredAt: number;
  txHash?: Hex;
};

export function poolsDir(): string {
  const cwd = process.cwd();
  const root = path.basename(cwd) === "web" ? path.dirname(cwd) : cwd;
  return path.join(root, ".private", "pools");
}

function catalogPath(): string {
  return path.join(poolsDir(), "pools.json");
}

export async function listRegisteredPools(): Promise<PoolRecord[]> {
  try {
    const raw = await readFile(catalogPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).sort((a, b) => b.registeredAt - a.registeredAt);
  } catch {
    return [];
  }
}

export async function registerPool(input: { address: Address; txHash?: Hex }): Promise<PoolRecord> {
  const address = getAddress(input.address);
  await mkdir(poolsDir(), { recursive: true });
  const rows = await listRegisteredPools();
  const record: PoolRecord = {
    address,
    registeredAt: Date.now(),
    txHash: input.txHash,
  };
  const next = rows.filter((row) => row.address.toLowerCase() !== address.toLowerCase());
  next.push(record);
  await writeFile(catalogPath(), JSON.stringify(next, null, 2));
  return record;
}

function isRecord(value: unknown): value is PoolRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PoolRecord>;
  return typeof row.address === "string" && isAddress(row.address) && typeof row.registeredAt === "number";
}

export async function poolCatalogExists(address: Address): Promise<boolean> {
  try {
    const rows = await listRegisteredPools();
    return rows.some((row) => row.address.toLowerCase() === address.toLowerCase());
  } catch {
    return false;
  }
}
import { isAddress, type Address } from "viem";

import { poolAddress } from "./wagmi";

export type PoolOption = {
  address: Address;
  label: string;
};

/** 브라우저에 노출된 풀 주소만 목록으로 만든다. */
export function configuredPoolOptions(): PoolOption[] {
  const rows: PoolOption[] = [];
  const seen = new Set<string>();

  const push = (label: string, value: string | undefined) => {
    if (!value || !isAddress(value)) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ address: value, label });
  };

  push("Pool A", poolAddress);
  push("Pool B", process.env.NEXT_PUBLIC_POOL_B_ADDRESS);

  return rows;
}

export function pickPool(value: string | null, options: PoolOption[]): Address | undefined {
  if (value && isAddress(value)) return value;
  return options[0]?.address ?? poolAddress;
}
import { formatUsdc } from "./display";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function displayNone<T>(value: T | undefined | null, format: (row: T) => string): string {
  if (value === undefined || value === null) return "none";
  return format(value);
}

export function displayAddress(value: string | undefined): string {
  if (!value) return "none";
  return value;
}

export function displayHash(value: string | undefined): string {
  if (!value || value.toLowerCase() === ZERO_HASH) return "none";
  return value;
}

export function displayBpsPercent(bps: number | undefined): string {
  if (bps === undefined) return "none";
  return `${(bps / 100).toFixed(2)}%`;
}

export function displayDays(days: number | undefined): string {
  if (days === undefined) return "none";
  return `${days}일`;
}

export function displayToleranceCents(cents: number | undefined): string {
  if (cents === undefined) return "none";
  return `$${(cents / 100).toFixed(2)}`;
}

export function displayUsdc(amount: bigint | undefined): string {
  if (amount === undefined) return "none";
  return `${formatUsdc(amount)} USDC`;
}
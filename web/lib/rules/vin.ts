import { keccak256, toBytes } from "viem";

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/** 공백·하이픈 제거, 대문자. 17자가 아니거나 I/O/Q 가 있으면 null. */
export function normalizeVin(value: string): string | null {
  const vin = value.toUpperCase().replace(/[\s-]/g, "");
  if (!VIN_PATTERN.test(vin)) return null;
  return vin;
}

/** 정규화 VIN 과 salt 문자열을 이어 keccak256. 실패하면 null. */
export function vinHash(value: string, salt: string): `0x${string}` | null {
  const vin = normalizeVin(value);
  if (!vin) return null;
  return keccak256(toBytes(`${vin}${salt}`));
}

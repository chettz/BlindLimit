import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { keccak256, toBytes } from "viem";

export type ReceiptSignature = {
  signingAddress: string;
  signature: string;
};

export function defaultReceiptsDir(): string {
  const cwd = process.cwd();
  const root = path.basename(cwd) === "web" ? path.dirname(cwd) : cwd;
  return path.join(root, ".private", "receipts");
}

export function receiptJson(input: { attestationRaw: unknown; signatures: ReceiptSignature[] }): string {
  return JSON.stringify({
    attestation: input.attestationRaw,
    signatures: input.signatures.map((signature) => ({
      signing_address: signature.signingAddress,
      signature: signature.signature,
    })),
  });
}

export function attestationHashOf(json: string): `0x${string}` {
  return keccak256(toBytes(json));
}

export async function buildReceipt(
  input: { attestationRaw: unknown; signatures: ReceiptSignature[] },
  dir = defaultReceiptsDir(),
): Promise<`0x${string}`> {
  const json = receiptJson(input);
  const hash = attestationHashOf(json);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${hash.slice(2)}.json`), json);
  return hash;
}

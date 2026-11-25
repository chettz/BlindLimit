import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";

import { attestationHashOf, buildReceipt, receiptJson } from "./receipt";

describe("buildReceipt", () => {
  it("stores the attestation and signatures and returns their keccak256", async () => {
    const input = {
      attestationRaw: { gateway_attestation: "report" },
      signatures: [{ signingAddress: "0xabc", signature: "sig" }],
    };
    const json = receiptJson(input);
    const dir = await mkdtemp(path.join(tmpdir(), "receipts-"));
    const hash = await buildReceipt(input, dir);
    const stored = await readFile(path.join(dir, `${hash.slice(2)}.json`), "utf8");

    expect(hash).toBe(attestationHashOf(json));
    expect(hash).toBe(keccak256(toBytes(stored)));
    expect(stored).toContain("signing_address");
    expect(stored).not.toContain("obligorName");
  });
});

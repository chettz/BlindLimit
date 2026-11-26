import { describe, expect, it } from "vitest";

import { reportDataForPublicKey } from "./dstackQuote";

describe("reportDataForPublicKey", () => {
  it("returns 64 hex chars (32 bytes) deterministically", () => {
    const a = reportDataForPublicKey("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA");
    const b = reportDataForPublicKey("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(reportDataForPublicKey("other")).not.toBe(a);
  });
});

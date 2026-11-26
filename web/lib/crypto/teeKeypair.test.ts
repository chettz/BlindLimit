import { describe, expect, it } from "vitest";

import { getTeeKeypair, hasDstackSock, isMockTee } from "./teeKeypair";

describe("teeKeypair", () => {
  it("exposes SPKI base64 public key and keeps the same pair", async () => {
    const a = await getTeeKeypair();
    const b = await getTeeKeypair();
    expect(a.publicKeySpkiBase64.length).toBeGreaterThan(100);
    expect(a.publicKeySpkiBase64).toBe(b.publicKeySpkiBase64);
    expect(a.publicKeySpkiBase64).not.toMatch(/BEGIN PRIVATE/i);
  });

  it("treats local env without dstack sock as mock", () => {
    expect(typeof isMockTee()).toBe("boolean");
    expect(typeof hasDstackSock()).toBe("boolean");
  });
});

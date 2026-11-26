import { afterEach, describe, expect, it } from "vitest";

describe("teeApiUrl", () => {
  const prev = process.env.NEXT_PUBLIC_TEE_API_BASE;

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_TEE_API_BASE;
    else process.env.NEXT_PUBLIC_TEE_API_BASE = prev;
  });

  it("uses same-origin when base is empty", async () => {
    delete process.env.NEXT_PUBLIC_TEE_API_BASE;
    const { teeApiUrl } = await import("./teeApiBase");
    expect(teeApiUrl("/api/attestation-key")).toBe("/api/attestation-key");
  });

  it("prefixes remote CVM base without trailing slash duplication", async () => {
    process.env.NEXT_PUBLIC_TEE_API_BASE = "https://cvm.example/";
    // 모듈이 env 를 읽으므로 동적 import 캐시 회피 — 함수는 매번 env 읽음
    const { teeApiUrl } = await import("./teeApiBase");
    expect(teeApiUrl("/api/collateral")).toBe("https://cvm.example/api/collateral");
  });
});

import { describe, expect, it } from "vitest";

import { sealBytesForTest, unsealBytes } from "./seal";
import { getTeeKeypair } from "./teeKeypair";

describe("seal round-trip", () => {
  it("decrypts a .txt contract sealed to the TEE public key", async () => {
    const { publicKeySpkiBase64 } = await getTeeKeypair();
    const plain = new TextEncoder().encode("VIN:1HGCM82633A004352\nprincipal:10000\n");
    const sealed = await sealBytesForTest(publicKeySpkiBase64, plain);
    const opened = await unsealBytes(sealed.wrappedKey, sealed.iv, sealed.ciphertext);
    expect(new TextDecoder().decode(opened)).toBe(new TextDecoder().decode(plain));
  });
});

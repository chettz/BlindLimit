import "server-only";

import { webcrypto } from "node:crypto";

import { base64ToBytes, bytesToBase64 } from "./base64";
import { getTeeKeypair } from "./teeKeypair";

export type SealedFile = { name: string; ciphertext: string };

export type SealedCollateralBody = {
  publish?: boolean;
  pool?: string;
  wrappedKey: string;
  iv: string;
  contracts: SealedFile[];
  tape: SealedFile;
};

/** RSA-OAEP 로 감싼 AES 키를 풀어 AES-GCM 평문 바이트를 만든다. */
export async function unsealBytes(
  wrappedKeyB64: string,
  ivB64: string,
  ciphertextB64: string,
): Promise<Uint8Array> {
  const { privateKey } = await getTeeKeypair();
  const rawKey = await webcrypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    base64ToBytes(wrappedKeyB64),
  );
  const aesKey = await webcrypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) },
    aesKey,
    base64ToBytes(ciphertextB64),
  );
  return new Uint8Array(plain);
}

export async function unsealCollateral(body: SealedCollateralBody): Promise<{
  contracts: { name: string; bytes: Uint8Array }[];
  tapeBytes: Uint8Array;
  tapeName: string;
}> {
  const contracts: { name: string; bytes: Uint8Array }[] = [];
  for (const file of body.contracts) {
    const bytes = await unsealBytes(body.wrappedKey, body.iv, file.ciphertext);
    contracts.push({ name: file.name, bytes });
  }
  const tapeBytes = await unsealBytes(body.wrappedKey, body.iv, body.tape.ciphertext);
  return { contracts, tapeBytes, tapeName: body.tape.name };
}

/** 테스트·스모크용: 공개키로 봉인 (서버 subtle). */
export async function sealBytesForTest(
  publicKeySpkiBase64: string,
  plain: Uint8Array,
): Promise<{ wrappedKey: string; iv: string; ciphertext: string }> {
  const spki = base64ToBytes(publicKeySpkiBase64);
  const publicKey = await webcrypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plain),
  );
  const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", aesKey));
  const wrapped = new Uint8Array(await webcrypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, raw));
  return {
    wrappedKey: bytesToBase64(wrapped),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

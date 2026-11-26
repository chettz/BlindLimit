import "server-only";

import { existsSync } from "node:fs";
import { webcrypto } from "node:crypto";

import { bytesToBase64 } from "./base64";

export type TeeKeyMaterial = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeySpkiBase64: string;
};

type GlobalTee = typeof globalThis & { __blindlimitTeeKey?: TeeKeyMaterial };

const RSA_OAEP = {
  name: "RSA-OAEP" as const,
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256" as const,
};

const SOCKS = ["/var/run/dstack.sock", "/var/run/tappd.sock"] as const;

/** 프로세스 메모리에만 두는 RSA-OAEP 키. 부팅 시 1회 생성. */
export async function getTeeKeypair(): Promise<TeeKeyMaterial> {
  const g = globalThis as GlobalTee;
  if (g.__blindlimitTeeKey) return g.__blindlimitTeeKey;

  const pair = (await webcrypto.subtle.generateKey(RSA_OAEP, true, ["encrypt", "decrypt"])) as CryptoKeyPair;
  const spki = await webcrypto.subtle.exportKey("spki", pair.publicKey);
  const material: TeeKeyMaterial = {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeySpkiBase64: bytesToBase64(new Uint8Array(spki)),
  };
  g.__blindlimitTeeKey = material;
  return material;
}

/** MOCK_TEE=true → 무조건 mock. false → 무조건 non-mock(quote는 sock 있을 때만). 미설정 → sock 없으면 mock. */
export function isMockTee(): boolean {
  const flag = process.env.MOCK_TEE?.toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return !dstackSockPath();
}

export function dstackSockPath(): string | undefined {
  return SOCKS.find((sock) => existsSync(sock));
}

/** dstack.sock 존재 여부 (실제 quote 는 dstackQuote.fetchDstackQuote). */
export function hasDstackSock(): boolean {
  const sock = dstackSockPath();
  return Boolean(sock && sock.endsWith("dstack.sock"));
}

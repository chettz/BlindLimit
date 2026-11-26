import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/base64";

import { teeApiUrl } from "./teeApiBase";

export type AttestationKeyResponse = {
  publicKeySpkiBase64: string;
  mock: boolean;
  quote?: string;
  reportData?: string;
  eventLog?: string;
  vmConfig?: string;
};

export type SealedUpload = {
  name: string;
  ciphertext: string;
};

function toBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    toBufferSource(base64ToBytes(spkiBase64)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

/** 브라우저에서 AES-GCM 으로 파일들을 봉인하고 AES 키를 RSA-OAEP 로 감싼다. */
export async function sealFiles(
  publicKeySpkiBase64: string,
  files: { name: string; bytes: Uint8Array }[],
): Promise<{ wrappedKey: string; iv: string; files: SealedUpload[] }> {
  const publicKey = await importPublicKey(publicKeySpkiBase64);
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed: SealedUpload[] = [];
  for (const file of files) {
    const plain = file.bytes.slice();
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plain),
    );
    sealed.push({ name: file.name, ciphertext: bytesToBase64(ciphertext) });
  }
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, raw));
  return {
    wrappedKey: bytesToBase64(wrapped),
    iv: bytesToBase64(iv),
    files: sealed,
  };
}

export async function fetchAttestationKey(): Promise<AttestationKeyResponse> {
  const response = await fetch(teeApiUrl("/api/attestation-key"));
  if (!response.ok) throw new Error("attestation-key 실패");
  const json: unknown = await response.json();
  if (
    !json ||
    typeof json !== "object" ||
    typeof (json as AttestationKeyResponse).publicKeySpkiBase64 !== "string" ||
    typeof (json as AttestationKeyResponse).mock !== "boolean"
  ) {
    throw new Error("attestation-key 형식 오류");
  }
  return json as AttestationKeyResponse;
}

/** 검증만(publish=false) 암호 POST. .pdf/.txt 계약 + .csv 장부. */
export async function postSealedVerify(input: {
  contracts: File[];
  tape: File;
  pool?: string;
}): Promise<{ ok: true; json: unknown } | { ok: false; status: number; json: unknown }> {
  const key = await fetchAttestationKey();
  const contractParts = await Promise.all(
    input.contracts.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
  const tapeBytes = new Uint8Array(await input.tape.arrayBuffer());
  const sealed = await sealFiles(key.publicKeySpkiBase64, [
    ...contractParts,
    { name: input.tape.name, bytes: tapeBytes },
  ]);
  const tapeSealed = sealed.files[sealed.files.length - 1];
  const contractSealed = sealed.files.slice(0, -1);
  const response = await fetch(teeApiUrl("/api/collateral"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publish: false,
      pool: input.pool,
      wrappedKey: sealed.wrappedKey,
      iv: sealed.iv,
      contracts: contractSealed,
      tape: tapeSealed,
      mockKey: key.mock,
    }),
  });
  const json: unknown = await response.json();
  if (!response.ok) return { ok: false, status: response.status, json };
  return { ok: true, json };
}

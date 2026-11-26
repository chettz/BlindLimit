/** base64 ↔ bytes. 브라우저·Node 공용. */

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  // slice() 로 독립 ArrayBuffer 를 만들어 WebCrypto BufferSource 타입과 맞춤
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64")).slice();
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

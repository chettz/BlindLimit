import { connection } from "next/server";

import { corsPreflight, jsonWithCors } from "@/lib/api/cors";
import { fetchDstackQuote } from "@/lib/crypto/dstackQuote";
import { getTeeKeypair, isMockTee } from "@/lib/crypto/teeKeypair";

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function GET(request: Request) {
  // cacheComponents: 빌드 시 mock:true 정적 캐시 방지 → 런타임 MOCK_TEE/sock 반영
  await connection();
  const key = await getTeeKeypair();
  const mock = isMockTee();
  const quoted = mock ? undefined : await fetchDstackQuote(key.publicKeySpkiBase64);
  return jsonWithCors(request, {
    publicKeySpkiBase64: key.publicKeySpkiBase64,
    mock,
    ...(quoted
      ? {
          quote: quoted.quote,
          reportData: quoted.reportData,
          eventLog: quoted.eventLog,
          vmConfig: quoted.vmConfig,
        }
      : {}),
  });
}

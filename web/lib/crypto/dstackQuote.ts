import "server-only";

import { createHash } from "node:crypto";
import http from "node:http";

import { dstackSockPath } from "./teeKeypair";

export type DstackQuoteResult = {
  quote: string;
  eventLog?: string;
  reportData: string;
  vmConfig?: string;
};

/** 공개키에 묶을 report_data (SHA-256 → 32바이트 hex). GetQuote 한도 64바이트. */
export function reportDataForPublicKey(publicKeySpkiBase64: string): string {
  return createHash("sha256").update(publicKeySpkiBase64, "utf8").digest("hex");
}

/**
 * `/var/run/dstack.sock` GetQuote.
 * sock 없거나 실패하면 undefined (로컬 MOCK 경로).
 */
export async function fetchDstackQuote(publicKeySpkiBase64: string): Promise<DstackQuoteResult | undefined> {
  const sock = dstackSockPath();
  // GetQuote 는 dstack.sock 전용 (tappd 레거시는 스킵)
  if (!sock || !sock.endsWith("dstack.sock")) return undefined;

  const reportData = reportDataForPublicKey(publicKeySpkiBase64);
  try {
    const raw = await unixJson(sock, "/GetQuote", { report_data: reportData });
    const quote = typeof raw.quote === "string" ? raw.quote : undefined;
    if (!quote) return undefined;
    return {
      quote,
      eventLog: typeof raw.event_log === "string" ? raw.event_log : undefined,
      reportData: typeof raw.report_data === "string" ? raw.report_data : reportData,
      vmConfig: typeof raw.vm_config === "string" ? raw.vm_config : undefined,
    };
  } catch {
    return undefined;
  }
}

function unixJson(
  socketPath: string,
  urlPath: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: urlPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`dstack ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(5_000, () => {
      req.destroy(new Error("dstack timeout"));
    });
    req.write(payload);
    req.end();
  });
}

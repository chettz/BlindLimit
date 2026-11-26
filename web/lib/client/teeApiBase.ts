/** 브라우저가 암호 API 를 칠 베이스. 비우면 same-origin. CVM URL 예: https://xxx.phala.network */
export function teeApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_TEE_API_BASE?.trim() ?? "";
  return raw.replace(/\/$/, "");
}

export function teeApiUrl(path: string): string {
  const base = teeApiBase();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

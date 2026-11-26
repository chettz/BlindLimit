/** 로컬 UI(localhost) → Phala CVM 크로스 오리진용. 집계 API만. */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && origin !== "null" ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function corsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonWithCors(
  request: Request,
  body: unknown,
  init?: { status?: number },
): Response {
  return Response.json(body, {
    status: init?.status,
    headers: corsHeaders(request),
  });
}

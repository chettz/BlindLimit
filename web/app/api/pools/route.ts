import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

import { listRegisteredPools, registerPool } from "@/lib/pools/store";

export async function GET() {
  const pools = await listRegisteredPools();
  return Response.json({ pools });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "요청 본문이 올바르지 않습니다" }, { status: 400 });
    const raw = body as { address?: unknown; txHash?: unknown };
    if (typeof raw.address !== "string" || !isAddress(raw.address)) {
      return Response.json({ error: "풀 주소가 올바르지 않습니다" }, { status: 400 });
    }
    const address = getAddress(raw.address) as Address;
    const txHash = typeof raw.txHash === "string" && isHex(raw.txHash) ? (raw.txHash as Hex) : undefined;
    const saved = await registerPool({ address, txHash });
    return Response.json({ address: saved.address, registeredAt: saved.registeredAt });
  } catch {
    return Response.json({ error: "풀 등록 실패" }, { status: 500 });
  }
}
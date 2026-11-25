import { isHex, type Hex } from "viem";

import { readAgreement } from "@/lib/agreements/store";

export async function GET(_request: Request, context: { params: Promise<{ hash: string }> }) {
  const { hash: raw } = await context.params;
  const agreementHash = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!isHex(agreementHash) || agreementHash.length !== 66) {
    return Response.json({ error: "약정서 해시가 올바르지 않습니다" }, { status: 400 });
  }
  const record = await readAgreement(agreementHash as Hex);
  if (!record) return Response.json({ error: "등록된 약정서가 없습니다" }, { status: 404 });
  return Response.json({
    agreementHash: record.agreementHash,
    lender: record.lender,
    lenderSig: record.lenderSig,
    submittedAt: record.submittedAt,
  });
}
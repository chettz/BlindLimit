import { getAddress, isAddress, isHex, keccak256, verifyMessage, type Address, type Hex } from "viem";

import { saveAgreement } from "@/lib/agreements/store";
import { readAgreementUpload } from "@/lib/agreements/upload";
import { PipelineError } from "@/lib/pipeline";

export async function GET(request: Request) {
  const { listAgreements, listAgreementsForLender } = await import("@/lib/agreements/store");
  const lender = new URL(request.url).searchParams.get("lender");
  if (lender) {
    if (!isAddress(lender)) return Response.json({ error: "대출사 주소가 올바르지 않습니다" }, { status: 400 });
    const rows = await listAgreementsForLender(getAddress(lender));
    return Response.json({ agreements: rows });
  }
  const rows = await listAgreements();
  return Response.json({ agreements: rows });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const agreementHash = parseHash(form.get("agreementHash"));
    const lender = parseAddress(form.get("lender"));
    const lenderSig = parseSig(form.get("lenderSig"));
    const file = await readAgreementUpload(form.get("agreement"));
    if (keccak256(file.bytes) !== agreementHash) throw new PipelineError("약정서 해시가 일치하지 않습니다");

    const valid = await verifyMessage({
      address: lender,
      message: { raw: agreementHash },
      signature: lenderSig,
    });
    if (!valid) throw new PipelineError("대출사 서명이 올바르지 않습니다");

    const saved = await saveAgreement({
      agreementHash,
      lender,
      lenderSig,
      bytes: file.bytes,
      fileName: file.name,
    });
    return Response.json({
      agreementHash: saved.agreementHash,
      lender: saved.lender,
      submittedAt: saved.submittedAt,
    });
  } catch (error) {
    return Response.json(errorBody(error), { status: errorStatus(error) });
  }
}

function parseHash(value: FormDataEntryValue | null): Hex {
  if (typeof value !== "string" || !isHex(value) || value.length !== 66) {
    throw new PipelineError("약정서 해시가 올바르지 않습니다");
  }
  return value as Hex;
}

function parseAddress(value: FormDataEntryValue | null): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new PipelineError("대출사 주소가 올바르지 않습니다");
  return getAddress(value);
}

function parseSig(value: FormDataEntryValue | null): Hex {
  if (typeof value !== "string" || !isHex(value)) throw new PipelineError("서명이 올바르지 않습니다");
  return value as Hex;
}

function errorStatus(error: unknown): number {
  if (error instanceof PipelineError) return 400;
  return 500;
}

function errorBody(error: unknown): { error: string } {
  if (error instanceof PipelineError) return { error: error.message };
  return { error: "약정 등록 실패" };
}
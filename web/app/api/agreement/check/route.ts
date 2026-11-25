import { isHex, keccak256, type Hex } from "viem";

import { bytesToAgreementText } from "@/lib/agreements/pdfText";
import { agreementFileExists, readAgreementBytes } from "@/lib/agreements/store";
import type { Settings } from "@/lib/rules/borrowingBase";
import { compareTerms } from "@/lib/rules/agreementCheck";
import { getTeeProvider } from "@/lib/tee";
import { PipelineError } from "@/lib/pipeline";

const MAX_BYTES = 8_000_000;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const settings = readSettings(form);
    const { bytes, name } = await agreementBytes(form);
    const agreementHash = await resolveHash(form, bytes);
    const text = await agreementText(name, bytes);
    const extracted = await getTeeProvider().extractAgreementTerms({ text });
    const compared = compareTerms(extracted.data, settings);
    return Response.json({
      agreementHash,
      fields: compared.fields,
      ok: compared.ok,
      mock: extracted.mock,
    });
  } catch (error) {
    const body = errorBody(error);
    return Response.json(body.json, { status: body.status });
  }
}

async function resolveHash(form: FormData, bytes: Uint8Array): Promise<Hex> {
  const raw = form.get("agreementHash");
  if (typeof raw === "string" && isHex(raw) && raw.length === 66) {
    const hash = raw as Hex;
    if (keccak256(bytes) !== hash) throw new PipelineError("약정서 해시가 일치하지 않습니다");
    return hash;
  }
  return keccak256(bytes);
}

async function agreementBytes(form: FormData): Promise<{ name: string; bytes: Uint8Array }> {
  const hashParam = form.get("agreementHash");
  if (typeof hashParam === "string" && isHex(hashParam) && hashParam.length === 66) {
    const hash = hashParam as Hex;
    if (!(await agreementFileExists(hash))) throw new PipelineError("저장된 약정서가 없습니다");
    const bytes = await readAgreementBytes(hash);
    return { name: "agreement.pdf", bytes };
  }
  return oneUpload(form.get("agreement"));
}

function readSettings(form: FormData): Settings {
  return {
    advanceRateBps: whole(form, "advanceRateBps"),
    delinquencyCutoffDays: whole(form, "delinquencyCutoffDays"),
    amountToleranceCents: BigInt(whole(form, "amountToleranceCents")),
    obligorConcBps: whole(form, "obligorConcBps"),
    dealerConcBps: whole(form, "dealerConcBps"),
    maxCommitment: BigInt(digits(form, "maxCommitment")),
  };
}

function whole(form: FormData, name: string): number {
  const raw = form.get(name);
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) throw new PipelineError(`${name} 값이 올바르지 않습니다`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new PipelineError(`${name} 값이 올바르지 않습니다`);
  return value;
}

function digits(form: FormData, name: string): string {
  const raw = form.get(name);
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) throw new PipelineError(`${name} 값이 올바르지 않습니다`);
  return raw.trim();
}

async function oneUpload(value: FormDataEntryValue | null): Promise<{ name: string; bytes: Uint8Array }> {
  if (!value || typeof value === "string" || !("arrayBuffer" in value)) throw new PipelineError("약정서가 없습니다");
  const name = value.name || "";
  const lower = name.toLowerCase();
  if (!lower.endsWith(".pdf") && !lower.endsWith(".txt")) throw new PipelineError("약정서 형식이 아닙니다");
  if (value.size > MAX_BYTES) throw new PipelineError("파일이 너무 큽니다");
  return { name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

async function agreementText(name: string, bytes: Uint8Array): Promise<string> {
  return bytesToAgreementText(bytes, !name.toLowerCase().endsWith(".txt"));
}

function errorBody(error: unknown): { status: number; json: { error: string } } {
  if (error instanceof PipelineError) return { status: 400, json: { error: error.message } };
  if (error instanceof Error && error.message.startsWith("MOCK ")) {
    return { status: 400, json: { error: error.message } };
  }
  if (error instanceof Error && (error.message.startsWith("AI ") || error.message.includes("추출"))) {
    return { status: 400, json: { error: error.message } };
  }
  return { status: 500, json: { error: "약정 대조 실패" } };
}
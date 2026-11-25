import { agreementTermsSchema, contractTermsSchema, type AgreementTerms, type ContractTerms } from "./types";

export function parseModelJson(raw: string): unknown {
  const stripped = stripFence(raw);
  const direct = tryParse(stripped);
  if (direct !== undefined) return direct;

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI 응답 JSON 파싱 실패");

  const sliced = tryParse(stripped.slice(start, end + 1));
  if (sliced !== undefined) return sliced;
  throw new Error("AI 응답 JSON 파싱 실패");
}

export function parseContractTerms(raw: string): ContractTerms {
  return readSchema(contractTermsSchema, raw);
}

export function parseAgreementTerms(raw: string): AgreementTerms {
  return readSchema(agreementTermsSchema, raw);
}

function readSchema<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, raw: string): T {
  const parsed = schema.safeParse(parseModelJson(raw));
  if (!parsed.success) throw new Error("AI 응답 검증 실패");
  return parsed.data;
}

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?[^\n]*\n?([\s\S]*?)\n?```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function tryParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

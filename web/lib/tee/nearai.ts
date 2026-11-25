import OpenAI, { APIError } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { keccak256, toBytes } from "viem";

import { parseAgreementTerms, parseContractTerms } from "./parse";
import type { TeeDocument, TeeProvider, TeeResult, TeeSignature } from "./types";

const BASE_URL = "https://cloud-api.near.ai/v1";
const DEFAULT_MODEL = "Qwen/Qwen3-VL-30B-A3B-Instruct";
const DEFAULT_LONG_MODEL = "z-ai/glm-5.3-flash";
// TODO: 16K 는 토큰 기준인데 토큰 계산 방법은 스펙에 없다. 시스템 프롬프트를 남기려고 문자 수 12000 을 넘으면 긴 모델로 바꾼다.
const SHORT_CONTEXT_CHAR_BUDGET = 12_000;
const JSON_ONLY = "JSON만 출력. 설명, 마크다운, 코드블록 없이 JSON 객체만 출력.";

const CONTRACT_INSTRUCTION = [
  "할부계약서에서 아래 키만 추출한다. 이름, 주소, 전화번호, 계약번호는 넣지 않는다.",
  "vin: Vehicle Identification Number. 공백을 제외한 17자.",
  "principalCents: Amount Financed 를 센트 단위 정수 문자열로. 12288.44 달러면 1228844.",
  "annualRateBps: APR 를 basis points 정수로. 29.90% 면 2990.",
].join("\n");

const AGREEMENT_INSTRUCTION = [
  "약정서에서 아래 키만 추출한다.",
  "advanceRateBps, delinquencyCutoffDays, amountToleranceCents, obligorConcBps, dealerConcBps: 정수",
  "maxCommitment: 정수 문자열",
].join("\n");

export function createNearAiProvider(): TeeProvider {
  return {
    extractInstallmentContract(doc) {
      return extract(doc, CONTRACT_INSTRUCTION, parseContractTerms);
    },
    extractAgreementTerms(doc) {
      return extract(doc, AGREEMENT_INSTRUCTION, parseAgreementTerms);
    },
    async getAttestation(nonce) {
      const raw = await getJson("/attestation/report", {
        model: modelName(),
        nonce: keccak256(toBytes(nonce)).slice(2),
        signing_algo: "ecdsa",
      });
      return { raw, mock: false };
    },
  };
}

async function extract<T>(doc: TeeDocument, instruction: string, parse: (raw: string) => T): Promise<TeeResult<T>> {
  if (!doc.text && !doc.imagePngBase64) throw new Error("추출할 문서가 없습니다");

  const model = chooseModel(doc.text);
  const completion = await complete(model, instruction, doc);
  const content = completion.choices[0]?.message?.content;
  if (!completion.id || typeof content !== "string") throw new Error("AI 추출 실패");

  const data = parse(content);
  const signature = await fetchSignature(completion.id, model);
  return { data, chatId: completion.id, signature, mock: false };
}

async function complete(model: string, instruction: string, doc: TeeDocument) {
  const messages = [
    { role: "system" as const, content: JSON_ONLY },
    { role: "user" as const, content: userContent(instruction, doc) },
  ];
  try {
    return await client().chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    });
  } catch (error) {
    if (!formatRejected(error)) throw new Error("AI 추출 실패");
    try {
      return await client().chat.completions.create({
        model,
        temperature: 0,
        messages,
      });
    } catch {
      throw new Error("AI 추출 실패");
    }
  }
}

function userContent(instruction: string, doc: TeeDocument): string | ChatCompletionContentPart[] {
  if (!doc.imagePngBase64) return `${instruction}\n\n${doc.text ?? ""}`;
  const parts: ChatCompletionContentPart[] = [{ type: "text", text: instruction }];
  if (doc.text) parts.push({ type: "text", text: doc.text });
  const mime = doc.imageMime ?? "image/png";
  parts.push({
    type: "image_url",
    image_url: { url: `data:${mime};base64,${doc.imagePngBase64}` },
  });
  return parts;
}

async function fetchSignature(chatId: string, model: string): Promise<TeeSignature> {
  const raw = await getJson(`/signature/${encodeURIComponent(chatId)}`, {
    model,
    signing_algo: "ecdsa",
  });
  if (!raw || typeof raw !== "object") throw new Error("응답 서명 조회 실패");
  const body = raw as Record<string, unknown>;
  if (
    typeof body.text !== "string" ||
    typeof body.signature !== "string" ||
    typeof body.signing_address !== "string" ||
    body.signing_algo !== "ecdsa"
  ) {
    throw new Error("응답 서명 조회 실패");
  }
  return {
    text: body.text,
    signature: body.signature,
    signingAddress: body.signing_address,
    signingAlgo: "ecdsa",
  };
}

async function getJson(pathname: string, query: Record<string, string>): Promise<unknown> {
  const url = new URL(pathname.replace(/^\//, ""), `${BASE_URL}/`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!response.ok) throw new Error("NEAR AI 조회 실패");
  try {
    return await response.json();
  } catch {
    throw new Error("NEAR AI 조회 실패");
  }
}

function chooseModel(text: string | undefined): string {
  if ((text?.length ?? 0) > SHORT_CONTEXT_CHAR_BUDGET) return longModel();
  return modelName();
}

function modelName(): string {
  return envOr("NEARAI_MODEL", DEFAULT_MODEL);
}

function longModel(): string {
  return envOr("NEARAI_LONG_MODEL", DEFAULT_LONG_MODEL);
}

function apiKey(): string {
  const key = process.env.NEARAI_API_KEY;
  if (!key) throw new Error("NEARAI_API_KEY 가 없습니다");
  return key;
}

function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function client(): OpenAI {
  return new OpenAI({ apiKey: apiKey(), baseURL: BASE_URL });
}

function formatRejected(error: unknown): boolean {
  return error instanceof APIError && (error.status === 400 || error.status === 422);
}

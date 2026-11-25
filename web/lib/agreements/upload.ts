import { PipelineError } from "../pipeline";
import type { TeeDocument } from "@/lib/tee/types";

import { agreementImageMime, isAgreementFileName, isAgreementImageName } from "./formats";
import { bytesToAgreementText } from "./pdfText";

export { AGREEMENT_ACCEPT } from "./formats";

export async function readAgreementUpload(
  value: FormDataEntryValue | null,
  maxBytes = 8_000_000,
): Promise<{ name: string; bytes: Uint8Array }> {
  if (!value || typeof value === "string" || !("arrayBuffer" in value)) throw new PipelineError("약정서가 없습니다");
  const name = value.name || "agreement";
  if (!isAgreementFileName(name)) throw new PipelineError("약정서 형식이 아닙니다");
  if (value.size > maxBytes) throw new PipelineError("파일이 너무 큽니다");
  return { name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

export async function agreementToTeeDocument(name: string, bytes: Uint8Array): Promise<TeeDocument> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt")) return { text: new TextDecoder().decode(bytes) };
  if (lower.endsWith(".pdf")) return { text: await bytesToAgreementText(bytes, true) };
  if (isAgreementImageName(name)) {
    return {
      imagePngBase64: Buffer.from(bytes).toString("base64"),
      imageMime: agreementImageMime(name),
    };
  }
  throw new PipelineError("약정서 형식이 아닙니다");
}
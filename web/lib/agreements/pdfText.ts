import { PipelineError } from "@/lib/pipeline";

export async function bytesToAgreementText(bytes: Uint8Array, pdf = true): Promise<string> {
  if (!pdf) return new TextDecoder().decode(bytes);
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes.slice(), verbosity: 0 });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  } catch {
    throw new PipelineError("약정서 텍스트 추출 실패");
  }
}
import { describe, expect, it } from "vitest";

import { parseContractTerms, parseModelJson } from "./parse";

const payload = {
  contractNo: "C-1",
  vin: "1HGCM82633A004352",
  obligorName: "OBLIGOR",
  dealerName: "DEALER",
  principalCents: "1000000",
  annualRateBps: 8500,
  daysPastDue: 0,
};

const json = JSON.stringify(payload);

describe("parseModelJson", () => {
  it("parses a fenced json block", () => {
    expect(parseModelJson(`\`\`\`json\n${json}\n\`\`\``)).toEqual(payload);
  });

  it("parses raw json", () => {
    expect(parseModelJson(json)).toEqual(payload);
  });

  it("parses json surrounded by explanation", () => {
    expect(parseModelJson(`추출 결과입니다.\n${json}\n이상입니다.`)).toEqual(payload);
  });

  it("does not include the source text in a parse error", () => {
    const marker = "UNIQUE_MARKER_DO_NOT_LEAK";
    expect(() => parseModelJson(`설명 ${marker} {`)).toThrow("AI 응답 JSON 파싱 실패");
    try {
      parseModelJson(`설명 ${marker} {`);
    } catch (error) {
      expect(String(error)).not.toContain(marker);
    }
  });
});

describe("parseContractTerms", () => {
  it("accepts the three response shapes and rejects a bad field without echoing it", () => {
    const fenced = `\`\`\`json\n${json}\n\`\`\``;
    const explained = `앞설명\n${json}\n뒤설명`;
    expect(parseContractTerms(fenced).principalCents).toBe("1000000");
    expect(parseContractTerms(json).vin).toBe(payload.vin);
    expect(parseContractTerms(explained).contractNo).toBe("C-1");

    const marker = "SECRET_OBLIGOR_NAME";
    const bad = JSON.stringify({ ...payload, obligorName: marker, vin: "SHORT" });
    expect(() => parseContractTerms(bad)).toThrow("AI 응답 검증 실패");
    try {
      parseContractTerms(bad);
    } catch (error) {
      expect(String(error)).not.toContain(marker);
    }
  });
});

import { describe, expect, it } from "vitest";

import type { AgreementTerms } from "../tee/types";
import { compareTerms } from "./agreementCheck";
import type { Settings } from "./borrowingBase";

function agreement(overrides: Partial<AgreementTerms> = {}): AgreementTerms {
  return {
    advanceRateBps: 8500,
    delinquencyCutoffDays: 30,
    amountToleranceCents: 100,
    obligorConcBps: 1000,
    dealerConcBps: 3000,
    maxCommitment: "500000000000",
    ...overrides,
  };
}

function poolSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    advanceRateBps: 8500,
    delinquencyCutoffDays: 30,
    amountToleranceCents: 100n,
    obligorConcBps: 1000,
    dealerConcBps: 3000,
    maxCommitment: 500_000_000_000n,
    ...overrides,
  };
}

describe("compareTerms", () => {
  it("6개 필드가 모두 같으면 ok", () => {
    const result = compareTerms(agreement(), poolSettings());
    expect(result.ok).toBe(true);
    expect(result.fields.every((field) => field.match)).toBe(true);
  });

  it("약정서 선급률 90% vs 설정 85% 이면 차단", () => {
    const result = compareTerms(agreement({ advanceRateBps: 9000 }), poolSettings({ advanceRateBps: 8500 }));
    expect(result.ok).toBe(false);
    const advance = result.fields.find((field) => field.name === "advanceRateBps");
    expect(advance?.agreement).toBe("90%");
    expect(advance?.setting).toBe("85%");
    expect(advance?.match).toBe(false);
  });

  it("허용오차·최대 약정 불일치도 행 단위로 표시", () => {
    const result = compareTerms(
      agreement({ amountToleranceCents: 200, maxCommitment: "400000000000" }),
      poolSettings({ amountToleranceCents: 100n, maxCommitment: 500_000_000_000n }),
    );
    expect(result.ok).toBe(false);
    expect(result.fields.find((field) => field.name === "amountToleranceCents")?.match).toBe(false);
    expect(result.fields.find((field) => field.name === "maxCommitment")?.match).toBe(false);
  });
});
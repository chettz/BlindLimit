import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  RULE_DESCRIPTION,
  RULE_VERSION,
  computeBorrowingBase,
  ruleHash,
  type Receivable,
  type Settings,
} from "./borrowingBase";

const VIN_A = `0x${"a".repeat(64)}` as `0x${string}`;
const VIN_B = `0x${"b".repeat(64)}` as `0x${string}`;
const VIN_C = `0x${"c".repeat(64)}` as `0x${string}`;

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    advanceRateBps: 10_000,
    delinquencyCutoffDays: 30,
    amountToleranceCents: 100n,
    obligorConcBps: 0,
    dealerConcBps: 0,
    maxCommitment: 0n,
    ...overrides,
  };
}

function row(overrides: Partial<Receivable> = {}): Receivable {
  const next: Receivable = {
    idHash: "id",
    vinHash: VIN_A,
    contractPrincipalCents: 10_000n,
    tapePrincipalCents: 10_000n,
    balanceCents: 10_000n,
    daysPastDue: 0,
    obligorKey: "obligor",
    dealerKey: "dealer",
    rateMismatch: false,
    pledgedElsewhere: false,
    ...overrides,
  };
  if (overrides.balanceCents === undefined) next.balanceCents = next.tapePrincipalCents;
  return next;
}

describe("computeBorrowingBase", () => {
  it("excludes a delinquent receivable and keeps one on the cutoff", () => {
    const result = computeBorrowingBase(
      [
        row({ idHash: "current", daysPastDue: 30, tapePrincipalCents: 5_000n, contractPrincipalCents: 5_000n }),
        row({ idHash: "late", vinHash: VIN_B, daysPastDue: 31, tapePrincipalCents: 9_000n, contractPrincipalCents: 9_000n }),
      ],
      settings({ advanceRateBps: 8500 }),
    );

    expect(result.excluded.DELINQUENT).toBe(1);
    expect(result.eligibleCount).toBe(1);
    expect(result.eligibleAmount).toBe(50_000_000n);
    expect(result.concentrationExcess).toBe(0n);
    expect(result.limit).toBe(42_500_000n);
    expect(result.eligibleVinHashes).toEqual([VIN_A]);
  });

  it("accepts a 100 cent principal gap and rejects 101 cents", () => {
    const result = computeBorrowingBase(
      [
        row({ idHash: "within", contractPrincipalCents: 10_000n, tapePrincipalCents: 10_100n, vinHash: VIN_A }),
        row({ idHash: "over", contractPrincipalCents: 10_000n, tapePrincipalCents: 10_101n, vinHash: VIN_B }),
      ],
      settings(),
    );

    expect(result.excluded.AMOUNT_MISMATCH).toBe(1);
    expect(result.eligibleCount).toBe(1);
    expect(result.eligibleAmount).toBe(101_000_000n);
    expect(result.limit).toBe(101_000_000n);
    expect(result.eligibleVinHashes).toEqual([VIN_A]);
  });

  it("excludes a rate mismatch", () => {
    const result = computeBorrowingBase([row({ rateMismatch: true, vinHash: VIN_B })], settings());

    expect(result.excluded.RATE_MISMATCH).toBe(1);
    expect(result.eligibleCount).toBe(0);
    expect(result.limit).toBe(0n);
    expect(result.eligibleVinHashes).toEqual([]);
  });

  it("excludes a VIN pledged to another pool", () => {
    const result = computeBorrowingBase([row({ pledgedElsewhere: true })], settings());

    expect(result.excluded.VIN_PLEDGED_ELSEWHERE).toBe(1);
    expect(result.eligibleCount).toBe(0);
    expect(result.eligibleAmount).toBe(0n);
  });

  it("counts every reason when one receivable fails more than one check", () => {
    const result = computeBorrowingBase(
      [
        row({
          daysPastDue: 31,
          contractPrincipalCents: 0n,
          tapePrincipalCents: 201n,
          rateMismatch: true,
          pledgedElsewhere: true,
        }),
      ],
      settings(),
    );

    expect(result.eligibleCount).toBe(0);
    expect(result.excluded).toEqual({
      DELINQUENT: 1,
      AMOUNT_MISMATCH: 1,
      RATE_MISMATCH: 1,
      VIN_PLEDGED_ELSEWHERE: 1,
    });
  });

  it("subtracts obligor concentration above the cap", () => {
    const result = computeBorrowingBase(
      [
        row({ idHash: "big", obligorKey: "a", tapePrincipalCents: 8_000n, contractPrincipalCents: 8_000n, vinHash: VIN_A }),
        row({ idHash: "small", obligorKey: "b", tapePrincipalCents: 2_000n, contractPrincipalCents: 2_000n, vinHash: VIN_B }),
      ],
      settings({ obligorConcBps: 5_000 }),
    );

    expect(result.eligibleAmount).toBe(100_000_000n);
    expect(result.concentrationExcess).toBe(30_000_000n);
    expect(result.limit).toBe(70_000_000n);
  });

  it("subtracts dealer concentration above the cap", () => {
    const result = computeBorrowingBase(
      [
        row({ idHash: "big", dealerKey: "a", tapePrincipalCents: 8_000n, contractPrincipalCents: 8_000n, vinHash: VIN_A }),
        row({ idHash: "small", dealerKey: "b", tapePrincipalCents: 2_000n, contractPrincipalCents: 2_000n, vinHash: VIN_B }),
      ],
      settings({ dealerConcBps: 5_000 }),
    );

    expect(result.concentrationExcess).toBe(30_000_000n);
    expect(result.limit).toBe(70_000_000n);
  });

  it("does not apply concentration when concBps is 0", () => {
    const result = computeBorrowingBase(
      [
        row({ obligorKey: "a", dealerKey: "a", tapePrincipalCents: 8_000n, contractPrincipalCents: 8_000n }),
        row({ obligorKey: "b", dealerKey: "b", tapePrincipalCents: 2_000n, contractPrincipalCents: 2_000n, vinHash: VIN_B }),
      ],
      settings({ obligorConcBps: 0, dealerConcBps: 0 }),
    );

    expect(result.concentrationExcess).toBe(0n);
    expect(result.limit).toBe(100_000_000n);
  });

  it("returns zeros for an empty list", () => {
    expect(computeBorrowingBase([], settings())).toEqual({
      eligibleCount: 0,
      eligibleAmount: 0n,
      concentrationExcess: 0n,
      limit: 0n,
      eligibleVinHashes: [],
      excluded: {
        DELINQUENT: 0,
        AMOUNT_MISMATCH: 0,
        RATE_MISMATCH: 0,
        VIN_PLEDGED_ELSEWHERE: 0,
      },
    });
  });

  it("dedupes and sorts eligible VIN hashes", () => {
    const result = computeBorrowingBase(
      [
        row({ idHash: "1", vinHash: VIN_C }),
        row({ idHash: "2", vinHash: VIN_A }),
        row({ idHash: "3", vinHash: VIN_A }),
      ],
      settings(),
    );

    expect(result.eligibleCount).toBe(3);
    expect(result.eligibleVinHashes).toEqual([VIN_A, VIN_C]);
  });

  it("hashes the rule description and version", () => {
    expect(RULE_VERSION).toBe("v3");
    expect(ruleHash).toBe(keccak256(toHex(`${RULE_DESCRIPTION}${RULE_VERSION}`)));
  });
});

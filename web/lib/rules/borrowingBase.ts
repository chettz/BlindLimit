import { keccak256, toHex } from "viem";

/** 컨트랙트 Settings 와 같은 6개 필드. maxCommitment 는 대출 시 컨트랙트가 적용한다. */
export type Settings = {
  advanceRateBps: number;
  delinquencyCutoffDays: number;
  amountToleranceCents: bigint;
  obligorConcBps: number;
  dealerConcBps: number;
  maxCommitment: bigint;
};

export type Receivable = {
  idHash: string;
  vinHash: `0x${string}`;
  contractPrincipalCents: bigint;
  tapePrincipalCents: bigint;
  daysPastDue: number;
  obligorKey: string;
  dealerKey: string;
  rateMismatch: boolean;
  pledgedElsewhere: boolean;
};

export const EXCLUSION_REASONS = [
  "DELINQUENT",
  "AMOUNT_MISMATCH",
  "RATE_MISMATCH",
  "VIN_PLEDGED_ELSEWHERE",
] as const;

export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export type BorrowingBase = {
  eligibleCount: number;
  eligibleAmount: bigint;
  concentrationExcess: bigint;
  limit: bigint;
  eligibleVinHashes: `0x${string}`[];
  excluded: Record<ExclusionReason, number>;
};

export const RULE_VERSION = "v2";

export const RULE_DESCRIPTION =
  "A receivable is ineligible when daysPastDue > delinquencyCutoffDays (DELINQUENT), abs(contractPrincipalCents - tapePrincipalCents) > amountToleranceCents (AMOUNT_MISMATCH), rateMismatch (RATE_MISMATCH), or pledgedElsewhere (VIN_PLEDGED_ELSEWHERE). Every matching reason is counted. eligibleAmount is the sum of eligible tapePrincipalCents * 10^4 (USDC 6 decimals). concentrationExcess is the sum of obligor and dealer totals above eligibleAmount * concBps / 10000; concBps 0 disables that side. limit = max(eligibleAmount - concentrationExcess, 0) * advanceRateBps / 10000, rounded down. maxCommitment is not applied.";

export const ruleHash = keccak256(toHex(`${RULE_DESCRIPTION}${RULE_VERSION}`));

const USDC_PER_CENT = 10_000n;
const BPS_DENOMINATOR = 10_000n;

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function emptyExcluded(): Record<ExclusionReason, number> {
  return {
    DELINQUENT: 0,
    AMOUNT_MISMATCH: 0,
    RATE_MISMATCH: 0,
    VIN_PLEDGED_ELSEWHERE: 0,
  };
}

function reasonsFor(row: Receivable, settings: Settings): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  if (row.daysPastDue > settings.delinquencyCutoffDays) reasons.push("DELINQUENT");
  const gap = abs(row.contractPrincipalCents - row.tapePrincipalCents);
  if (gap > settings.amountToleranceCents) reasons.push("AMOUNT_MISMATCH");
  if (row.rateMismatch) reasons.push("RATE_MISMATCH");
  if (row.pledgedElsewhere) reasons.push("VIN_PLEDGED_ELSEWHERE");
  return reasons;
}

function toUsdc(cents: bigint): bigint {
  return cents * USDC_PER_CENT;
}

function addAmount(totals: Map<string, bigint>, key: string, amount: bigint) {
  totals.set(key, (totals.get(key) ?? 0n) + amount);
}

/** concBps 가 0이면 그 축은 적용하지 않는다. 초과분 합은 내림이다. */
function concentrationExcess(totals: Map<string, bigint>, eligibleAmount: bigint, concBps: number): bigint {
  if (concBps === 0) return 0n;
  const cap = (eligibleAmount * BigInt(concBps)) / BPS_DENOMINATOR;
  let excess = 0n;
  for (const sum of totals.values()) {
    if (sum > cap) excess += sum - cap;
  }
  return excess;
}

export function computeBorrowingBase(rows: readonly Receivable[], settings: Settings): BorrowingBase {
  const excluded = emptyExcluded();
  const obligorTotals = new Map<string, bigint>();
  const dealerTotals = new Map<string, bigint>();
  const vinHashes = new Set<`0x${string}`>();

  let eligibleCount = 0;
  let eligibleAmount = 0n;

  for (const row of rows) {
    const reasons = reasonsFor(row, settings);
    if (reasons.length > 0) {
      for (const reason of reasons) excluded[reason] += 1;
      continue;
    }

    const amount = toUsdc(row.tapePrincipalCents);
    eligibleCount += 1;
    eligibleAmount += amount;
    addAmount(obligorTotals, row.obligorKey, amount);
    addAmount(dealerTotals, row.dealerKey, amount);
    vinHashes.add(row.vinHash);
  }

  const excess =
    concentrationExcess(obligorTotals, eligibleAmount, settings.obligorConcBps) +
    concentrationExcess(dealerTotals, eligibleAmount, settings.dealerConcBps);
  const net = eligibleAmount > excess ? eligibleAmount - excess : 0n;

  return {
    eligibleCount,
    eligibleAmount,
    concentrationExcess: excess,
    limit: (net * BigInt(settings.advanceRateBps)) / BPS_DENOMINATOR,
    eligibleVinHashes: [...vinHashes].sort(),
    excluded,
  };
}

import type { AgreementTerms } from "../tee/types";
import type { Settings } from "./borrowingBase";

export type AgreementFieldRow = {
  name: string;
  labelKo: string;
  agreement: string;
  setting: string;
  match: boolean;
};

export type AgreementCompareResult = {
  ok: boolean;
  fields: AgreementFieldRow[];
};

/** 약정서에서 추출한 6개 조건과 운영자가 입력한 풀 설정을 항목별로 비교한다. */
export function compareTerms(extracted: AgreementTerms, settings: Settings): AgreementCompareResult {
  const rows: AgreementFieldRow[] = [
    row(
      "advanceRateBps",
      "선급률",
      extracted.advanceRateBps,
      settings.advanceRateBps,
      formatBps,
    ),
    row(
      "delinquencyCutoffDays",
      "연체 기준일",
      extracted.delinquencyCutoffDays,
      settings.delinquencyCutoffDays,
      (value) => `${value}일`,
    ),
    row(
      "amountToleranceCents",
      "금액 허용오차",
      extracted.amountToleranceCents,
      settings.amountToleranceCents,
      formatCents,
    ),
    row(
      "obligorConcBps",
      "차주 집중도",
      extracted.obligorConcBps,
      settings.obligorConcBps,
      formatBps,
    ),
    row(
      "dealerConcBps",
      "딜러 집중도",
      extracted.dealerConcBps,
      settings.dealerConcBps,
      formatBps,
    ),
    row(
      "maxCommitment",
      "최대 약정액",
      BigInt(extracted.maxCommitment),
      settings.maxCommitment,
      formatUsdc,
    ),
  ];
  return { ok: rows.every((field) => field.match), fields: rows };
}

function row<A extends number | bigint, S extends number | bigint>(
  name: string,
  labelKo: string,
  agreement: A,
  setting: S,
  format: (value: A | S) => string,
): AgreementFieldRow {
  const match = bigintEq(agreement, setting);
  return {
    name,
    labelKo,
    agreement: format(agreement),
    setting: format(setting),
    match,
  };
}

function bigintEq(left: number | bigint, right: number | bigint): boolean {
  return BigInt(left) === BigInt(right);
}

function formatBps(bps: number | bigint): string {
  const value = Number(bps);
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

function formatCents(cents: number | bigint): string {
  const value = Number(cents);
  return `$${(value / 100).toFixed(2)}`;
}

function formatUsdc(amount: number | bigint): string {
  const value = BigInt(amount);
  const whole = value / 1_000_000n;
  const fraction = value % 1_000_000n;
  const frac = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length === 0 ? `${whole} USDC` : `${whole}.${frac} USDC`;
}
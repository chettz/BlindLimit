import { parseAgreementTerms, parseContractTerms } from "./parse";
import type { TeeDocument, TeeProvider, TeeResult, AgreementTerms, ContractTerms } from "./types";

const CONTRACT_FIELDS = [
  "contractNo",
  "vin",
  "obligorName",
  "dealerName",
  "principalCents",
  "annualRateBps",
  "daysPastDue",
] as const;

const AGREEMENT_FIELDS = [
  "advanceRateBps",
  "delinquencyCutoffDays",
  "amountToleranceCents",
  "obligorConcBps",
  "dealerConcBps",
  "maxCommitment",
] as const;

const NUMBER_FIELDS = new Set<string>([
  "annualRateBps",
  "daysPastDue",
  "advanceRateBps",
  "delinquencyCutoffDays",
  "amountToleranceCents",
  "obligorConcBps",
  "dealerConcBps",
]);

export function createMockProvider(): TeeProvider {
  return {
    async extractInstallmentContract(doc) {
      return done(parseContractTerms(JSON.stringify(readFields(doc, CONTRACT_FIELDS))));
    },
    async extractAgreementTerms(doc) {
      return done(parseAgreementTerms(JSON.stringify(readFields(doc, AGREEMENT_FIELDS))));
    },
    async getAttestation() {
      return { raw: { mock: true }, mock: true };
    },
  };
}

function done<T>(data: T): TeeResult<T> {
  return { data, mock: true };
}

function readFields(doc: TeeDocument, names: readonly string[]): Record<string, string | number> {
  if (!doc.text) throw new Error("MOCK 추출 실패");
  const out: Record<string, string | number> = {};
  for (const name of names) {
    const value = doc.text.match(new RegExp(`(?:^|\\n)\\s*${name}\\s*[:=]\\s*([^\\n]+)`, "i"))?.[1]?.trim();
    if (!value) throw new Error("MOCK 추출 실패");
    out[name] = NUMBER_FIELDS.has(name) && /^\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

export type { AgreementTerms, ContractTerms };

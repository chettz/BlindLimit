import { percentToBps, usdToCents } from "../rules/tape";
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
      const labeled = readFields(doc, CONTRACT_FIELDS);
      const fields = labeled ?? documentFields(doc.text);
      if (!fields) throw new Error("MOCK 추출 실패");
      return done(parseContractTerms(JSON.stringify(fields)));
    },
    async extractAgreementTerms(doc) {
      const fields = readFields(doc, AGREEMENT_FIELDS);
      if (!fields) throw new Error("MOCK 추출 실패");
      return done(parseAgreementTerms(JSON.stringify(fields)));
    },
    async getAttestation() {
      return { raw: { mock: true }, mock: true };
    },
  };
}

function done<T>(data: T): TeeResult<T> {
  return { data, mock: true };
}

function readFields(doc: TeeDocument, names: readonly string[]): Record<string, string | number> | undefined {
  if (!doc.text) return undefined;
  const out: Record<string, string | number> = {};
  for (const name of names) {
    const value = doc.text.match(new RegExp(`(?:^|\\n)\\s*${name}\\s*[:=]\\s*([^\\n]+)`, "i"))?.[1]?.trim();
    if (!value) return undefined;
    out[name] = NUMBER_FIELDS.has(name) && /^\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

function documentFields(text: string | undefined): Record<string, string | number> | undefined {
  if (!text) return undefined;
  const vin = findVin(text);
  const principal = findPrincipal(text);
  const apr = findApr(text);
  if (!vin || !principal || !apr) return undefined;
  return {
    vin,
    principalCents: usdToCents(principal.replace(/[$,]/g, "")).toString(),
    annualRateBps: percentToBps(apr),
  };
}

function findVin(text: string): string | undefined {
  const serial = text.match(/SERIAL\s*\/\s*VIN\s*:\s*([A-Za-z0-9 ]+)/)?.[1];
  if (serial) return serial.replace(/\s+/g, "").toUpperCase();
  return text.match(/Vehicle Identification Number:?\s*([A-Za-z0-9]+)/i)?.[1]?.toUpperCase();
}

function findPrincipal(text: string): string | undefined {
  return (
    text.match(/PRINCIPAL FINANCED\s*:\s*([\d,]+\.\d{2})/)?.[1] ??
    text.match(/Amount Financed\s*\(3 \+ 4\)[^\n$]*\$\s*([\d,]+\.\d{2})/)?.[1] ??
    text.match(/USD\s+([\d,]+\.\d{2})\s+is financed/i)?.[1]
  );
}

function findApr(text: string): string | undefined {
  return (
    text.match(/RATE\s*\(APR\)\s*:\s*(\d+(?:\.\d+)?)\s*%/)?.[1] ??
    text.match(/annual percentage rate of\s+(\d+(?:\.\d+)?)\s+percent/i)?.[1] ??
    text.match(/(\d+\.\d+)\s*%/)?.[1]
  );
}

export type { AgreementTerms, ContractTerms };

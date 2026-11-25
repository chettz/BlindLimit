import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

export type AgreementRecord = {
  agreementHash: Hex;
  lender: Address;
  lenderSig: Hex;
  submittedAt: number;
};

export type AgreementListItem = {
  agreementHash: Hex;
  lender: Address;
  submittedAt: number;
};

export function agreementsDir(): string {
  const cwd = process.cwd();
  const root = path.basename(cwd) === "web" ? path.dirname(cwd) : cwd;
  return path.join(root, ".private", "agreements");
}

function catalogPath(): string {
  return path.join(agreementsDir(), "agreements.json");
}

function filePath(agreementHash: Hex): string {
  return path.join(agreementsDir(), `${agreementHash.slice(2)}.pdf`);
}

export async function listAgreements(): Promise<AgreementListItem[]> {
  try {
    const raw = await readFile(catalogPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecord)
      .map((row) => ({
        agreementHash: row.agreementHash,
        lender: row.lender,
        submittedAt: row.submittedAt,
      }))
      .sort((a, b) => b.submittedAt - a.submittedAt);
  } catch {
    return [];
  }
}

export async function readAgreement(agreementHash: Hex): Promise<AgreementRecord | undefined> {
  const rows = await readCatalog();
  return rows.find((row) => row.agreementHash.toLowerCase() === agreementHash.toLowerCase());
}

export async function readAgreementBytes(agreementHash: Hex): Promise<Uint8Array> {
  const bytes = await readFile(filePath(agreementHash));
  return new Uint8Array(bytes);
}

export async function saveAgreement(input: {
  agreementHash: Hex;
  lender: Address;
  lenderSig: Hex;
  bytes: Uint8Array;
}): Promise<AgreementRecord> {
  const agreementHash = input.agreementHash.toLowerCase() as Hex;
  const lender = getAddress(input.lender);
  await mkdir(agreementsDir(), { recursive: true });
  await writeFile(filePath(agreementHash), input.bytes);
  const record: AgreementRecord = {
    agreementHash,
    lender,
    lenderSig: input.lenderSig,
    submittedAt: Date.now(),
  };
  const rows = await readCatalog();
  const next = rows.filter((row) => row.agreementHash.toLowerCase() !== agreementHash.toLowerCase());
  next.push(record);
  await writeFile(catalogPath(), JSON.stringify(next, null, 2));
  return record;
}

async function readCatalog(): Promise<AgreementRecord[]> {
  try {
    const raw = await readFile(catalogPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is AgreementRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AgreementRecord>;
  return (
    typeof row.agreementHash === "string" &&
    isHex(row.agreementHash) &&
    typeof row.lender === "string" &&
    isAddress(row.lender) &&
    typeof row.lenderSig === "string" &&
    isHex(row.lenderSig) &&
    typeof row.submittedAt === "number"
  );
}

export async function agreementFileExists(agreementHash: Hex): Promise<boolean> {
  try {
    await access(filePath(agreementHash));
    return true;
  } catch {
    return false;
  }
}
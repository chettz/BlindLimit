import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

export type AgreementRecord = {
  agreementHash: Hex;
  lender: Address;
  lenderSig: Hex;
  submittedAt: number;
  fileName?: string;
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

function filePath(agreementHash: Hex, fileName?: string): string {
  const ext = extensionFromName(fileName) ?? ".pdf";
  return path.join(agreementsDir(), `${agreementHash.slice(2)}${ext}`);
}

export async function listAgreementsForLender(lender: Address): Promise<AgreementListItem[]> {
  const key = getAddress(lender).toLowerCase();
  const rows = await listAgreements();
  return rows.filter((row) => row.lender.toLowerCase() === key);
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

export async function readAgreementBytes(agreementHash: Hex): Promise<{ bytes: Uint8Array; fileName: string }> {
  const record = await readAgreement(agreementHash);
  const fileName = record?.fileName ?? "agreement.pdf";
  const bytes = await readFile(filePath(agreementHash, fileName));
  return { bytes: new Uint8Array(bytes), fileName };
}

export async function saveAgreement(input: {
  agreementHash: Hex;
  lender: Address;
  lenderSig: Hex;
  bytes: Uint8Array;
  fileName: string;
}): Promise<AgreementRecord> {
  const agreementHash = input.agreementHash.toLowerCase() as Hex;
  const lender = getAddress(input.lender);
  await mkdir(agreementsDir(), { recursive: true });
  await writeFile(filePath(agreementHash, input.fileName), input.bytes);
  const record: AgreementRecord = {
    agreementHash,
    lender,
    lenderSig: input.lenderSig,
    submittedAt: Date.now(),
    fileName: input.fileName,
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
    const record = await readAgreement(agreementHash);
    await access(filePath(agreementHash, record?.fileName));
    return true;
  } catch {
    return false;
  }
}

function extensionFromName(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const lower = fileName.toLowerCase();
  const index = lower.lastIndexOf(".");
  if (index < 0) return undefined;
  return lower.slice(index);
}
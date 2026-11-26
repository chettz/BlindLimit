import { concat, getAddress, isAddress, keccak256, toBytes, zeroAddress, type Address } from "viem";

import { computeBorrowingBase, ruleHash, type ExclusionReason, type Settings } from "./rules/borrowingBase";
import { parseTapeCsv } from "./rules/tape";
import { normalizeVin, vinHash } from "./rules/vin";
import { attestationHashOf, receiptJson, type ReceiptSignature } from "./tee/receipt";
import type { TeeProvider, TeeResult, ContractTerms } from "./tee/types";

export type ContractFile = {
  name: string;
  bytes: Uint8Array;
};

/** 풀 설정이 없을 때(검증만) 쓰는 기본값 — 프로젝트 Settings 6필드 */
export const DEFAULT_SETTINGS: Settings = {
  advanceRateBps: 8500,
  delinquencyCutoffDays: 30,
  amountToleranceCents: 100n,
  obligorConcBps: 1000,
  dealerConcBps: 4000,
  maxCommitment: 500_000_000_000n,
};

export type PipelineInput = {
  /** publish=false 이면 생략 가능. 있으면 해당 풀 설정·이중담보 기준에 사용 */
  pool?: Address;
  /** false 면 한도 계산만 하고 postLimit 생략. 기본 true */
  publish?: boolean;
  contracts: ContractFile[];
  tapeCsv: string;
};

export type PostLimitArgs = {
  docBundleHash: `0x${string}`;
  attestationHash: `0x${string}`;
  ruleHash: `0x${string}`;
  eligibleCount: number;
  eligibleAmount: bigint;
  limit: bigint;
  eligibleVinHashes: `0x${string}`[];
};

export type ChainPort = {
  readSettings(pool: Address): Promise<Settings>;
  checkBatch(vinHashes: `0x${string}`[]): Promise<Address[]>;
  postLimit(
    pool: Address,
    args: PostLimitArgs,
  ): Promise<{ txHash: string; status: "success" | "reverted"; revertName?: string }>;
};

export type PipelineDeps = {
  tee: TeeProvider;
  chain: ChainPort;
  signer: { address: Address };
  salt: string;
  saveReceipt(json: string): Promise<void>;
  now(): number;
};

export type PipelineExcluded = Record<ExclusionReason | "NO_TAPE_MATCH" | "INVALID_VIN", number>;

export type PipelineResult = {
  eligibleCount: number;
  eligibleAmount: bigint;
  concentrationExcess: bigint;
  limit: bigint;
  excluded: PipelineExcluded;
  vinsRegistered: number;
  txHash: string;
  attestationHash: `0x${string}`;
  mock: boolean;
};

export class PipelineError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

type Joined = {
  hash: `0x${string}`;
  contractPrincipalCents: bigint;
  tapePrincipalCents: bigint;
  balanceCents: bigint;
  daysPastDue: number;
  obligorKey: string;
  dealerKey: string;
  rateMismatch: boolean;
};

/** 계약서와 장부를 정규화 VIN 으로 맞춘 뒤 한도를 계산한다. publish=true 이면 한 tx 로 게시. */
export async function runBorrowingBase(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const publish = input.publish !== false;
  if (publish) {
    if (!input.pool || !isAddress(input.pool)) throw new PipelineError("풀 주소가 올바르지 않습니다");
    if (!isAddress(deps.signer.address)) throw new PipelineError("오라클 주소가 없습니다");
  } else if (input.pool && !isAddress(input.pool)) {
    throw new PipelineError("풀 주소가 올바르지 않습니다");
  }
  if (input.contracts.length === 0) throw new PipelineError("계약서가 없습니다");

  const pool = input.pool && isAddress(input.pool) ? input.pool : zeroAddress;
  const docBundleHash = bundleHash([
    ...input.contracts.map((file) => file.bytes),
    new TextEncoder().encode(input.tapeCsv),
  ]);
  const tape = indexTape(input.tapeCsv);
  const joined: Joined[] = [];
  let invalidVin = 0;
  let noTapeMatch = 0;
  let mock = false;
  const signatures: ReceiptSignature[] = [];

  for (const file of input.contracts) {
    const extracted = await deps.tee.extractInstallmentContract({ text: await contractText(file) });
    mock = mock || extracted.mock;
    const signature = signatureOf(extracted);
    if (signature) signatures.push(signature);

    const outcome = join(extracted.data, tape, deps.salt);
    if (outcome === "INVALID_VIN") invalidVin += 1;
    else if (outcome === "NO_TAPE_MATCH") noTapeMatch += 1;
    else joined.push(outcome);
  }

  const hashes = [...new Set(joined.map((row) => row.hash))].sort();
  // 검증만: 온체인 이중담보·풀 설정 조회 생략 (RPC 불필요). 게시에만 체인 사용.
  const pledged = publish
    ? await pledgedElsewhere(pool, hashes, deps.chain)
    : new Map<`0x${string}`, boolean>();
  const settings =
    !publish || pool === zeroAddress ? DEFAULT_SETTINGS : await deps.chain.readSettings(pool);
  const base = computeBorrowingBase(
    joined.map((row) => ({
      idHash: row.hash,
      vinHash: row.hash,
      contractPrincipalCents: row.contractPrincipalCents,
      tapePrincipalCents: row.tapePrincipalCents,
      balanceCents: row.balanceCents,
      daysPastDue: row.daysPastDue,
      obligorKey: row.obligorKey,
      dealerKey: row.dealerKey,
      rateMismatch: row.rateMismatch,
      pledgedElsewhere: pledged.get(row.hash) ?? false,
    })),
    settings,
  );

  const attestation = await deps.tee.getAttestation(String(deps.now()));
  mock = mock || attestation.mock;
  const json = receiptJson({ attestationRaw: attestation.raw, signatures });
  await deps.saveReceipt(json);
  const attestationHash = attestationHashOf(json);

  let txHash = "";
  if (publish) {
    const posted = await deps.chain.postLimit(pool, {
      docBundleHash,
      attestationHash,
      ruleHash,
      eligibleCount: base.eligibleCount,
      eligibleAmount: base.eligibleAmount,
      limit: base.limit,
      eligibleVinHashes: base.eligibleVinHashes,
    });
    if (posted.status === "reverted") {
      if (posted.revertName === "AlreadyPledged") {
        throw new PipelineError("다른 풀에 이미 담보로 잡힌 차량 포함 — 다시 제출", "VIN_RACE");
      }
      throw new PipelineError("한도 게시 실패");
    }
    txHash = posted.txHash;
  }

  return {
    eligibleCount: base.eligibleCount,
    eligibleAmount: base.eligibleAmount,
    concentrationExcess: base.concentrationExcess,
    limit: base.limit,
    excluded: {
      ...base.excluded,
      NO_TAPE_MATCH: noTapeMatch,
      INVALID_VIN: invalidVin,
    },
    vinsRegistered: base.eligibleVinHashes.length,
    txHash,
    attestationHash,
    mock,
  };
}

function indexTape(csv: string): Map<string, ReturnType<typeof parseTapeCsv>[number]> {
  const rows = new Map<string, ReturnType<typeof parseTapeCsv>[number]>();
  for (const row of parseTapeCsv(csv)) rows.set(row.vin, row);
  return rows;
}

function join(
  terms: ContractTerms,
  tape: Map<string, ReturnType<typeof parseTapeCsv>[number]>,
  salt: string,
): Joined | "INVALID_VIN" | "NO_TAPE_MATCH" {
  const vin = normalizeVin(terms.vin);
  const hash = vin ? vinHash(vin, salt) : null;
  if (!vin || !hash) return "INVALID_VIN";
  const row = tape.get(vin);
  if (!row) return "NO_TAPE_MATCH";
  return {
    hash,
    contractPrincipalCents: BigInt(terms.principalCents),
    tapePrincipalCents: row.amountFinancedCents,
    balanceCents: row.balanceCents,
    daysPastDue: row.daysPastDue,
    obligorKey: keccak256(toBytes(row.borrowerId)),
    dealerKey: keccak256(toBytes(row.dealer)),
    rateMismatch: terms.annualRateBps !== row.aprBps,
  };
}

async function pledgedElsewhere(
  pool: Address,
  hashes: `0x${string}`[],
  chain: ChainPort,
): Promise<Map<`0x${string}`, boolean>> {
  const found = new Map<`0x${string}`, boolean>();
  if (hashes.length === 0) return found;
  const holders = await chain.checkBatch(hashes);
  if (holders.length !== hashes.length) throw new PipelineError("VIN 조회 실패");
  const current = getAddress(pool);
  hashes.forEach((hash, index) => {
    const holder = getAddress(holders[index]);
    found.set(hash, holder !== zeroAddress && holder !== current);
  });
  return found;
}

function bundleHash(parts: Uint8Array[]): `0x${string}` {
  const hashes = parts.map((part) => keccak256(part)).sort();
  return keccak256(concat(hashes.map((hash) => toBytes(hash))));
}

function signatureOf(result: TeeResult<ContractTerms>): ReceiptSignature | undefined {
  if (!result.signature) return undefined;
  return { signingAddress: result.signature.signingAddress, signature: result.signature.signature };
}

async function contractText(file: ContractFile): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return new TextDecoder().decode(file.bytes);
  if (!name.endsWith(".pdf")) throw new PipelineError("계약서 형식이 아닙니다");
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: file.bytes.slice(), verbosity: 0 });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError("계약서 텍스트 추출 실패");
  }
}

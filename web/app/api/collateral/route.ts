import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { corsPreflight, jsonWithCors } from "@/lib/api/cors";
import { createPoolChain } from "@/lib/chain/poolClient";
import { chainAddresses, getOracleWalletClient, getPublicClient } from "@/lib/chain/client";
import { unsealCollateral, type SealedCollateralBody } from "@/lib/crypto/seal";
import {
  DEFAULT_SETTINGS,
  PipelineError,
  runBorrowingBase,
  type ChainPort,
  type PipelineResult,
} from "@/lib/pipeline";
import { attestationHashOf, defaultReceiptsDir } from "@/lib/tee/receipt";
import { getTeeProvider } from "@/lib/tee";

const MAX_BYTES = 8_000_000;
const MAX_CONTRACTS = 40;
const CONTRACT_EXTS = [".pdf", ".txt"] as const;
const TAPE_EXTS = [".csv"] as const;

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  const salt = process.env.VIN_SALT;
  if (!salt) return jsonWithCors(request, { error: "서버 설정 누락" }, { status: 500 });

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const packed = contentType.includes("application/json")
      ? await fromSealedJson(request)
      : await fromFormData(request);

    const chainDeps = packed.publish ? publishChainDeps() : verifyOnlyChainDeps();
    const posted = await runBorrowingBase(
      {
        pool: packed.pool,
        publish: packed.publish,
        contracts: packed.contracts,
        tapeCsv: packed.tapeCsv,
      },
      {
        tee: getTeeProvider(),
        ...chainDeps,
        salt,
        saveReceipt,
        now: () => Date.now(),
      },
    );
    return jsonWithCors(request, toJson(posted, packed.publish));
  } catch (error) {
    const body = errorBody(error);
    return jsonWithCors(request, body.json, { status: body.status });
  }
}

async function fromSealedJson(request: Request): Promise<{
  publish: boolean;
  pool?: Address;
  contracts: { name: string; bytes: Uint8Array }[];
  tapeCsv: string;
}> {
  const body = (await request.json()) as SealedCollateralBody;
  if (!body?.wrappedKey || !body.iv || !body.tape || !Array.isArray(body.contracts)) {
    throw new PipelineError("암호 페이로드가 올바르지 않습니다");
  }
  if (body.publish === true) {
    throw new PipelineError("암호 업로드는 검증만 지원합니다");
  }
  const opened = await unsealCollateral(body);
  assertExt(opened.tapeName, TAPE_EXTS);
  if (opened.contracts.length === 0) throw new PipelineError("계약서가 없습니다");
  if (opened.contracts.length > MAX_CONTRACTS) throw new PipelineError("계약서 개수가 너무 많습니다");
  for (const file of opened.contracts) {
    assertExt(file.name, CONTRACT_EXTS);
    if (file.bytes.byteLength > MAX_BYTES) throw new PipelineError("파일이 너무 큽니다");
  }
  if (opened.tapeBytes.byteLength > MAX_BYTES) throw new PipelineError("파일이 너무 큽니다");

  const tapeCsv = new TextDecoder().decode(opened.tapeBytes);
  const contracts = opened.contracts.map((file) => ({
    name: file.name,
    bytes: file.bytes.slice(),
  }));
  opened.tapeBytes.fill(0);
  for (const file of opened.contracts) file.bytes.fill(0);

  return {
    publish: false,
    pool: optionalPoolFromValue(body.pool, request, false),
    contracts,
    tapeCsv,
  };
}

async function fromFormData(request: Request): Promise<{
  publish: boolean;
  pool?: Address;
  contracts: { name: string; bytes: Uint8Array }[];
  tapeCsv: string;
}> {
  const form = await request.formData();
  const publish = publishFlag(form, request);
  const pool = optionalPool(request, form, publish);
  const tape = await oneFile(form.get("tape"), [...TAPE_EXTS]);
  const contracts = await manyFiles(form.getAll("contracts"), [...CONTRACT_EXTS]);
  return {
    publish,
    pool,
    contracts: contracts.map((file) => ({ name: file.name, bytes: file.bytes })),
    tapeCsv: new TextDecoder().decode(tape.bytes),
  };
}

function assertExt(name: string, extensions: readonly string[]): void {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!extensions.includes(extension)) throw new PipelineError("파일 형식이 아닙니다");
}

function publishFlag(form: FormData, request: Request): boolean {
  const fromForm = form.get("publish");
  if (typeof fromForm === "string") {
    return !(fromForm === "0" || fromForm.toLowerCase() === "false");
  }
  const fromQuery = new URL(request.url).searchParams.get("publish");
  if (fromQuery !== null) {
    return !(fromQuery === "0" || fromQuery.toLowerCase() === "false");
  }
  return true;
}

function optionalPool(request: Request, form: FormData, publish: boolean): Address | undefined {
  const fromForm = form.get("pool");
  const value =
    (typeof fromForm === "string" && fromForm) ||
    new URL(request.url).searchParams.get("pool") ||
    process.env.NEXT_PUBLIC_POOL_ADDRESS ||
    process.env.POOL_A_ADDRESS ||
    undefined;
  return optionalPoolFromValue(value || undefined, request, publish);
}

function optionalPoolFromValue(
  value: string | undefined,
  request: Request,
  publish: boolean,
): Address | undefined {
  const resolved =
    value ||
    new URL(request.url).searchParams.get("pool") ||
    process.env.NEXT_PUBLIC_POOL_ADDRESS ||
    process.env.POOL_A_ADDRESS ||
    undefined;
  if (!resolved) {
    if (publish) throw new PipelineError("풀 주소가 없습니다");
    return undefined;
  }
  if (!isAddress(resolved)) throw new PipelineError("풀 주소가 올바르지 않습니다");
  return resolved;
}

function oracleKeyFromEnv(): Hex {
  const key = process.env.ORACLE_PRIVATE_KEY;
  if (!key?.startsWith("0x")) throw new PipelineError("ORACLE_PRIVATE_KEY 가 없습니다");
  return key as Hex;
}

function publishChainDeps(): { chain: ChainPort; signer: { address: Address } } {
  const oracleKey = oracleKeyFromEnv();
  return {
    chain: createPoolChain({
      publicClient: getPublicClient(),
      walletClient: getOracleWalletClient(),
      registry: chainAddresses().registry,
      oracleKey,
    }),
    signer: { address: privateKeyToAccount(oracleKey).address },
  };
}

/** 검증만: RPC·오라클·레지스트리 없이 noop 체인. */
function verifyOnlyChainDeps(): { chain: ChainPort; signer: { address: Address } } {
  const chain: ChainPort = {
    readSettings: async () => DEFAULT_SETTINGS,
    checkBatch: async (hashes) => hashes.map(() => zeroAddress),
    postLimit: async () => {
      throw new PipelineError("검증만 모드에서는 게시할 수 없습니다");
    },
  };
  return { chain, signer: { address: zeroAddress } };
}

async function saveReceipt(json: string): Promise<void> {
  const dir = defaultReceiptsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${attestationHashOf(json).slice(2)}.json`), json);
}

function toJson(result: PipelineResult, publish: boolean) {
  return {
    eligibleCount: result.eligibleCount,
    eligibleAmount: result.eligibleAmount.toString(),
    concentrationExcess: result.concentrationExcess.toString(),
    limit: result.limit.toString(),
    excluded: result.excluded,
    vinsRegistered: result.vinsRegistered,
    txHash: result.txHash,
    attestationHash: result.attestationHash,
    mock: result.mock,
    published: publish && result.txHash.length > 0,
  };
}

function errorBody(error: unknown): { status: number; json: { error: string; code?: string } } {
  if (error instanceof PipelineError) {
    return {
      status: error.code === "VIN_RACE" ? 409 : 400,
      json: { error: error.message, code: error.code },
    };
  }
  if (error instanceof Error && isPublicError(error.message)) {
    return { status: 400, json: { error: error.message } };
  }
  return { status: 500, json: { error: "담보 처리 실패" } };
}

function isPublicError(message: string): boolean {
  return (
    message.startsWith("장부") ||
    message.startsWith("계약서") ||
    message.startsWith("암호 ") ||
    message.startsWith("AI ") ||
    message.startsWith("MOCK ") ||
    message.startsWith("풀 ") ||
    message.startsWith("파일 ") ||
    message.endsWith("가 없습니다") ||
    message.endsWith("이 없습니다") ||
    message.endsWith("지원합니다")
  );
}

type Upload = { name: string; bytes: Uint8Array };

async function oneFile(value: FormDataEntryValue | null, extensions: string[]): Promise<Upload> {
  if (!value) throw new PipelineError("장부 파일이 없습니다");
  return readUpload(value, extensions);
}

async function manyFiles(values: FormDataEntryValue[], extensions: string[]): Promise<Upload[]> {
  if (values.length === 0) throw new PipelineError("계약서가 없습니다");
  if (values.length > MAX_CONTRACTS) throw new PipelineError("계약서 개수가 너무 많습니다");
  return Promise.all(values.map((value) => readUpload(value, extensions)));
}

async function readUpload(value: FormDataEntryValue, extensions: string[]): Promise<Upload> {
  if (typeof value === "string" || !("arrayBuffer" in value)) throw new PipelineError("파일 형식이 아닙니다");
  const name = value.name || "";
  assertExt(name, extensions);
  if (value.size > MAX_BYTES) throw new PipelineError("파일이 너무 큽니다");
  return { name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

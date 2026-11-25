import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createPoolChain } from "@/lib/chain/poolClient";
import { chainAddresses, getOracleWalletClient, getPublicClient } from "@/lib/chain/client";
import { PipelineError, runBorrowingBase, type PipelineResult } from "@/lib/pipeline";
import { attestationHashOf, defaultReceiptsDir } from "@/lib/tee/receipt";
import { getTeeProvider } from "@/lib/tee";

const MAX_BYTES = 8_000_000;
const MAX_CONTRACTS = 40;

export async function POST(request: Request) {
  const salt = process.env.VIN_SALT;
  if (!salt) return Response.json({ error: "서버 설정 누락" }, { status: 500 });

  try {
    const form = await request.formData();
    const pool = poolAddress(request);
    const tape = await oneFile(form.get("tape"), [".csv"]);
    const contracts = await manyFiles(form.getAll("contracts"), [".pdf", ".txt"]);
    const oracleKey = oracleKeyFromEnv();
    const posted = await runBorrowingBase(
      {
        pool,
        contracts: contracts.map((file) => ({ name: file.name, bytes: file.bytes })),
        tapeCsv: new TextDecoder().decode(tape.bytes),
      },
      {
        tee: getTeeProvider(),
        chain: createPoolChain({
          publicClient: getPublicClient(),
          walletClient: getOracleWalletClient(),
          registry: chainAddresses().registry,
          oracleKey,
        }),
        signer: { address: privateKeyToAccount(oracleKey).address },
        salt,
        saveReceipt,
        now: () => Date.now(),
      },
    );
    return Response.json(toJson(posted));
  } catch (error) {
    const body = errorBody(error);
    return Response.json(body.json, { status: body.status });
  }
}

function poolAddress(request: Request): Address {
  const url = new URL(request.url);
  const value = url.searchParams.get("pool") ?? process.env.NEXT_PUBLIC_POOL_ADDRESS ?? process.env.POOL_A_ADDRESS;
  if (!value || !isAddress(value)) throw new PipelineError("풀 주소가 없습니다");
  return value;
}

function oracleKeyFromEnv(): Hex {
  const key = process.env.ORACLE_PRIVATE_KEY;
  if (!key?.startsWith("0x")) throw new PipelineError("ORACLE_PRIVATE_KEY 가 없습니다");
  return key as Hex;
}

async function saveReceipt(json: string): Promise<void> {
  const dir = defaultReceiptsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${attestationHashOf(json).slice(2)}.json`), json);
}

function toJson(result: PipelineResult) {
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
    message.startsWith("AI ") ||
    message.startsWith("MOCK ") ||
    message.startsWith("풀 ") ||
    message.endsWith("가 없습니다") ||
    message.endsWith("이 없습니다")
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
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!extensions.includes(extension)) throw new PipelineError("파일 형식이 아닙니다");
  if (value.size > MAX_BYTES) throw new PipelineError("파일이 너무 큽니다");
  return { name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

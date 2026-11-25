import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";

import type { ChainPort, PipelineDeps, PostLimitArgs } from "./pipeline";
import { PipelineError, runBorrowingBase } from "./pipeline";
import { vinHash } from "./rules/vin";
import type { TeeProvider } from "./tee/types";

const POOL = "0x0000000000000000000000000000000000000002" as Address;
const OTHER = "0x0000000000000000000000000000000000000003" as Address;
const SALT = "pepper";
const GOOD = "1HGCM82633A004352";
const LATE = "4T1BF1FK5CU514589";
const MISSING = "JH4KA4650MC000123";
const BORROWER = "BORROWER_SECRET_NAME";

const HEADER =
  "loan_id,vin,borrower_id,dealer,apr_pct,amount_financed_usd,current_balance_usd,days_past_due";

function tape(rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

function file(vin: string, principalCents: string, apr = "2990") {
  const text = [`vin: ${vin}`, `principalCents: ${principalCents}`, `annualRateBps: ${apr}`].join("\n");
  return { name: `${vin}.txt`, bytes: new TextEncoder().encode(text) };
}

function tee(): TeeProvider {
  return {
    async extractInstallmentContract(doc) {
      return {
        mock: true,
        data: {
          contractNo: "",
          vin: value(doc.text, "vin"),
          obligorName: "",
          dealerName: "",
          principalCents: value(doc.text, "principalCents"),
          annualRateBps: Number(value(doc.text, "annualRateBps")),
          daysPastDue: 0,
        },
      };
    },
    async extractAgreementTerms() {
      throw new Error("사용하지 않음");
    },
    async getAttestation() {
      return { raw: { mock: true }, mock: true };
    },
  };
}

function value(text: string | undefined, name: string): string {
  const found = text?.match(new RegExp(`${name}:\\s*(\\S+)`))?.[1];
  if (!found) throw new Error("테스트 추출 실패");
  return found;
}

function chain(options?: { holder?: Address; revert?: string }) {
  const posts: PostLimitArgs[] = [];
  const port: ChainPort = {
    async readSettings() {
      return {
        advanceRateBps: 10_000,
        delinquencyCutoffDays: 30,
        amountToleranceCents: 100n,
        obligorConcBps: 0,
        dealerConcBps: 0,
        maxCommitment: 0n,
      };
    },
    async checkBatch(hashes) {
      return hashes.map((hash) => (options?.holder && hash === vinHash(GOOD, SALT) ? options.holder : zeroAddress));
    },
    async postLimit(_pool, args) {
      posts.push(args);
      if (options?.revert) return { txHash: "0xabc", status: "reverted", revertName: options.revert };
      return { txHash: "0xabc", status: "success" };
    },
  };
  return { port, posts };
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function deps(port: ChainPort): PipelineDeps {
  return {
    tee: tee(),
    chain: port,
    signer: { address: "0x0000000000000000000000000000000000000001" },
    salt: SALT,
    saveReceipt: async () => {},
    now: () => 1,
  };
}

describe("runBorrowingBase", () => {
  it("posts once and registers only the eligible VIN hash", async () => {
    const { port, posts } = chain();
    const result = await runBorrowingBase(
      {
        pool: POOL,
        contracts: [file(GOOD, "10000"), file(LATE, "10000")],
        tapeCsv: tape([
          `L1,${GOOD},${BORROWER},North Motors,29.90,100.00,90.00,0`,
          `L2,${LATE},OTHER_SECRET,North Motors,29.90,100.00,80.00,31`,
        ]),
      },
      deps(port),
    );

    expect(posts).toHaveLength(1);
    expect(posts[0].eligibleVinHashes).toEqual([vinHash(GOOD, SALT)]);
    expect(result.eligibleCount).toBe(1);
    expect(result.eligibleAmount).toBe(90_000_000n);
    expect(result.limit).toBe(90_000_000n);
    expect(result.vinsRegistered).toBe(1);
    expect(result.excluded.DELINQUENT).toBe(1);
    expect(result.mock).toBe(true);
    expect(result.txHash).toBe("0xabc");
    expect(json(result)).not.toContain(GOOD);
    expect(json(result)).not.toContain(BORROWER);
  });

  it("excludes a VIN pledged to another pool", async () => {
    const { port, posts } = chain({ holder: OTHER });
    const result = await runBorrowingBase(
      {
        pool: POOL,
        contracts: [file(GOOD, "10000")],
        tapeCsv: tape([`L1,${GOOD},${BORROWER},North Motors,29.90,100.00,90.00,0`]),
      },
      deps(port),
    );

    expect(result.excluded.VIN_PLEDGED_ELSEWHERE).toBe(1);
    expect(result.eligibleCount).toBe(0);
    expect(posts[0].eligibleVinHashes).toEqual([]);
  });

  it("excludes a 101 cent amount gap", async () => {
    const { port } = chain();
    const result = await runBorrowingBase(
      {
        pool: POOL,
        contracts: [file(GOOD, "10000")],
        tapeCsv: tape([`L1,${GOOD},${BORROWER},North Motors,29.90,101.01,90.00,0`]),
      },
      deps(port),
    );

    expect(result.excluded.AMOUNT_MISMATCH).toBe(1);
    expect(result.eligibleCount).toBe(0);
  });

  it("counts a contract with no tape row", async () => {
    const { port, posts } = chain();
    const result = await runBorrowingBase(
      {
        pool: POOL,
        contracts: [file(MISSING, "10000")],
        tapeCsv: tape([`L1,${GOOD},${BORROWER},North Motors,29.90,100.00,90.00,0`]),
      },
      deps(port),
    );

    expect(result.excluded.NO_TAPE_MATCH).toBe(1);
    expect(posts[0].eligibleVinHashes).toEqual([]);
    expect(json(result)).not.toContain(MISSING);
  });

  it("skips postLimit when publish is false", async () => {
    const { port, posts } = chain();
    const result = await runBorrowingBase(
      {
        pool: POOL,
        publish: false,
        contracts: [file(GOOD, "10000")],
        tapeCsv: tape([`L1,${GOOD},${BORROWER},North Motors,29.90,100.00,90.00,0`]),
      },
      deps(port),
    );

    expect(posts).toHaveLength(0);
    expect(result.txHash).toBe("");
    expect(result.eligibleCount).toBe(1);
    expect(result.limit).toBe(90_000_000n);
  });

  it("returns VIN_RACE when posting reverts with AlreadyPledged", async () => {
    const { port } = chain({ revert: "AlreadyPledged" });
    const error = await runBorrowingBase(
      {
        pool: POOL,
        contracts: [file(GOOD, "10000")],
        tapeCsv: tape([`L1,${GOOD},${BORROWER},North Motors,29.90,100.00,90.00,0`]),
      },
      deps(port),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PipelineError);
    expect(error).toMatchObject({
      code: "VIN_RACE",
      message: "다른 풀에 이미 담보로 잡힌 차량 포함 — 다시 제출",
    });
    expect(String(error)).not.toContain(GOOD);
    expect(String(error)).not.toContain(BORROWER);
  });
});

"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useReadContract, useWriteContract } from "wagmi";

import { loanPoolAbi, mockUsdcAbi } from "@/lib/chain/abi";
import { borrowErrorMessage, formatUsdc, readsLocalFork, txUrl } from "@/lib/chain/display";
import { appChain } from "@/lib/chain/network";
import { configuredPoolOptions, pickPool } from "@/lib/chain/pools";
import { usdcAddress } from "@/lib/chain/wagmi";

const POLL_MS = 10_000;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

type CollateralResult = {
  eligibleCount: number;
  eligibleAmount: string;
  limit: string;
  excluded: {
    DELINQUENT: number;
    AMOUNT_MISMATCH: number;
    RATE_MISMATCH: number;
    VIN_PLEDGED_ELSEWHERE: number;
    NO_TAPE_MATCH: number;
    INVALID_VIN: number;
  };
  vinsRegistered: number;
  txHash: string;
  mock: boolean;
};

export default function LenderPage() {
  return (
    <Suspense fallback={<main className="px-6 py-10">불러오는 중…</main>}>
      <LenderPageContent />
    </Suspense>
  );
}

function LenderPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poolParam = searchParams.get("pool");
  const poolOptions = useMemo(() => configuredPoolOptions(), []);
  const [activePool, setActivePool] = useState<Address | undefined>(() => pickPool(poolParam, poolOptions));
  const [customPool, setCustomPool] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    setActivePool(pickPool(poolParam, poolOptions));
  }, [poolParam, poolOptions]);

  const inPresetList = poolOptions.some((row) => row.address.toLowerCase() === activePool?.toLowerCase());

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync, isPending: borrowing } = useWriteContract();

  const pool = activePool ?? ZERO;
  const usdc = usdcAddress ?? ZERO;
  const ready = Boolean(activePool && usdcAddress);
  const query = { refetchInterval: POLL_MS, enabled: ready };

  const limit = useReadContract({ address: pool, abi: loanPoolAbi, functionName: "limit", query });
  const borrowed = useReadContract({ address: pool, abi: loanPoolAbi, functionName: "borrowed", query });
  const available = useReadContract({ address: pool, abi: loanPoolAbi, functionName: "availableToBorrow", query });
  const settings = useReadContract({ address: pool, abi: loanPoolAbi, functionName: "settings", query });
  const lender = useReadContract({ address: pool, abi: loanPoolAbi, functionName: "lender", query });
  const balance = useReadContract({
    address: usdc,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    query: { ...query, enabled: ready && Boolean(address) },
  });

  const [contracts, setContracts] = useState<File[]>([]);
  const [tape, setTape] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CollateralResult | null>(null);
  const [amount, setAmount] = useState("");
  const [borrowError, setBorrowError] = useState<string | null>(null);
  const [borrowTx, setBorrowTx] = useState<string | null>(null);

  function selectPool(address: Address) {
    setActivePool(address);
    setCustomError(null);
    router.replace(`/lender?pool=${address}`, { scroll: false });
  }

  function applyCustomPool() {
    const value = customPool.trim();
    if (!isAddress(value)) {
      setCustomError("풀 주소가 올바르지 않습니다");
      return;
    }
    selectPool(value);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePool || contracts.length === 0 || !tape) return;
    setSubmitting(true);
    setSubmitError(null);
    const body = new FormData();
    for (const file of contracts) body.append("contracts", file);
    body.append("tape", tape);
    try {
      const response = await fetch(`/api/collateral?pool=${activePool}`, { method: "POST", body });
      const json: unknown = await response.json();
      if (!response.ok) {
        setResult(null);
        setSubmitError(errorText(json));
        return;
      }
      if (!isCollateralResult(json)) {
        setResult(null);
        setSubmitError("담보 처리 실패");
        return;
      }
      setResult(json);
      await Promise.all([limit.refetch(), borrowed.refetch(), available.refetch(), settings.refetch()]);
    } catch {
      setSubmitError("담보 처리 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function onBorrow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePool) return;
    setBorrowError(null);
    setBorrowTx(null);
    try {
      const hash = await writeContractAsync({
        address: activePool,
        abi: loanPoolAbi,
        functionName: "borrow",
        args: [parseUnits(amount.replaceAll(",", ""), 6)],
      });
      setBorrowTx(hash);
      await Promise.all([limit.refetch(), borrowed.refetch(), available.refetch(), balance.refetch()]);
    } catch (error) {
      if (error instanceof Error && error.name.includes("InvalidDecimalNumber")) {
        setBorrowError("금액을 확인해 주세요");
        return;
      }
      setBorrowError(borrowErrorMessage(error));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">대출사</p>
          <h1 className="text-2xl font-semibold">담보 제출과 대출</h1>
        </div>
        {isConnected ? (
          <button className="rounded-full border px-4 py-2" type="button" onClick={() => disconnect()}>
            {shortAddress(address)} 연결 해제
          </button>
        ) : (
          <button
            className="rounded-full bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
            type="button"
            disabled={connecting || connectors.length === 0}
            onClick={() => {
              const connector = connectors[0];
              if (connector) void connect({ connector });
            }}
          >
            지갑 연결
          </button>
        )}
      </header>

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-lg font-semibold">담보·대출 풀 선택</h2>
        {poolOptions.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            등록된 풀
            <select
              className="rounded border px-3 py-2 font-mono text-sm"
              value={inPresetList && activePool ? activePool : ""}
              onChange={(event) => {
                const value = event.target.value;
                if (value && isAddress(value)) selectPool(value);
              }}
            >
              {!inPresetList ? <option value="">목록 밖 주소 사용 중</option> : null}
              {poolOptions.map((row) => (
                <option key={row.address} value={row.address}>
                  {row.label} ({shortAddress(row.address)})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-zinc-500">NEXT_PUBLIC_POOL_ADDRESS 가 없으면 아래에 풀 주소를 입력하세요.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
            다른 풀 주소 (팩토리 배포 등)
            <input
              className="rounded border px-3 py-2 font-mono text-sm"
              placeholder="0x…"
              value={customPool}
              onChange={(event) => setCustomPool(event.target.value)}
            />
          </label>
          <button className="rounded-full border px-4 py-2 text-sm" type="button" onClick={applyCustomPool}>
            적용
          </button>
        </div>
        {customError ? <p className="text-sm text-red-700">{customError}</p> : null}
        {activePool ? (
          <p className="text-sm">
            선택됨 <span className="font-mono">{activePool}</span>{" "}
            <a className="underline" href={`/pool/${activePool}`}>
              풀 상세
            </a>
          </p>
        ) : null}
      </section>

      {!ready ? <p>풀 주소가 설정되지 않았습니다</p> : null}
      {readsLocalFork() ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">
          이 화면은 로컬 포크를 봅니다. 지갑에서 Localhost 8545를 선택하세요. 체인 ID는 31337입니다.
        </p>
      ) : null}
      {isConnected && chainId !== appChain().id ? <p>지갑 네트워크를 Localhost 8545로 바꿔 주세요</p> : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <Stat label="한도" value={usdcText(limit.data)} />
        <Stat label="대출 잔액" value={usdcText(borrowed.data)} />
        <Stat label="가능액" value={usdcText(available.data)} />
        <Stat label="최대 약정" value={usdcText(settings.data?.maxCommitment)} />
        <Stat label="내 USDC" value={address ? usdcText(balance.data) : "지갑 연결 필요"} />
        <Stat label="대출사 계정" value={lender.data ? shortAddress(lender.data) : "—"} />
      </section>

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <h2 className="text-lg font-semibold">담보 제출</h2>
        <label className="flex flex-col gap-1 text-sm">
          할부계약서 (.pdf, .txt, 여러 개)
          <input
            className="rounded border px-3 py-2"
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            multiple
            onChange={(event) => setContracts(Array.from(event.target.files ?? []))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          대출장부 (.csv)
          <input
            className="rounded border px-3 py-2"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setTape(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          className="w-fit rounded-full bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          type="submit"
          disabled={!ready || submitting || contracts.length === 0 || !tape}
        >
          {submitting ? "담보를 계산하는 중입니다" : "담보 제출"}
        </button>
        {submitError ? <p>{submitError}</p> : null}
      </form>

      {result ? <ResultCard result={result} /> : null}

      <form className="flex flex-col gap-3" onSubmit={onBorrow}>
        <h2 className="text-lg font-semibold">대출 실행</h2>
        <label className="flex flex-col gap-1 text-sm">
          요청액 (USDC)
          <input
            className="rounded border px-3 py-2"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <button
          className="w-fit rounded-full bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          type="submit"
          disabled={!ready || !isConnected || borrowing || amount.trim() === ""}
        >
          {borrowing ? "대출 실행 중" : "대출 실행"}
        </button>
        {borrowError ? <p>{borrowError}</p> : null}
        {borrowTx ? (
          <a className="underline" href={txUrl(borrowTx)}>
            대출 거래 {shortHash(borrowTx)}
          </a>
        ) : null}
      </form>
    </main>
  );
}

function ResultCard({ result }: { result: CollateralResult }) {
  const rows = [
    ["연체", result.excluded.DELINQUENT],
    ["금액 불일치", result.excluded.AMOUNT_MISMATCH],
    ["금리 불일치", result.excluded.RATE_MISMATCH],
    ["장부 미매칭", result.excluded.NO_TAPE_MATCH],
    ["VIN 형식 오류", result.excluded.INVALID_VIN],
  ] as const;

  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">담보 결과</h2>
        {result.mock ? <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold">MOCK</span> : null}
      </div>
      <p>적격 {result.eligibleCount}건 · {formatUsdc(BigInt(result.eligibleAmount))} USDC</p>
      <p className="font-semibold">다른 풀에 담보 잡힌 차량 {result.excluded.VIN_PLEDGED_ELSEWHERE}건</p>
      <ul className="text-sm">
        {rows.map(([label, count]) => (
          <li key={label}>
            {label} {count}건
          </li>
        ))}
      </ul>
      <p>등록된 VIN {result.vinsRegistered}건</p>
      <p>한도 {formatUsdc(BigInt(result.limit))} USDC</p>
      <a className="underline" href={txUrl(result.txHash)}>
        한도 게시 거래 {shortHash(result.txHash)}
      </a>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="text-lg">{value}</p>
    </div>
  );
}

function usdcText(value: bigint | undefined): string {
  return value === undefined ? "—" : `${formatUsdc(value)} USDC`;
}

function shortAddress(value: string | undefined): string {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

function errorText(json: unknown): string {
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") return json.error;
  return "담보 처리 실패";
}

function isCollateralResult(json: unknown): json is CollateralResult {
  if (!json || typeof json !== "object") return false;
  const value = json as Partial<CollateralResult>;
  return (
    typeof value.eligibleCount === "number" &&
    typeof value.eligibleAmount === "string" &&
    typeof value.limit === "string" &&
    typeof value.vinsRegistered === "number" &&
    typeof value.txHash === "string" &&
    typeof value.mock === "boolean" &&
    isExcluded(value.excluded)
  );
}

function isExcluded(value: CollateralResult["excluded"] | undefined): value is CollateralResult["excluded"] {
  if (!value) return false;
  return (
    typeof value.DELINQUENT === "number" &&
    typeof value.AMOUNT_MISMATCH === "number" &&
    typeof value.RATE_MISMATCH === "number" &&
    typeof value.VIN_PLEDGED_ELSEWHERE === "number" &&
    typeof value.NO_TAPE_MATCH === "number" &&
    typeof value.INVALID_VIN === "number"
  );
}

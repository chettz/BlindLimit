"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { isAddress, parseUnits, type Address } from "viem";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";

import { loanPoolAbi, mockUsdcAbi } from "@/lib/chain/abi";
import { borrowErrorMessage, formatUsdc, readsLocalFork, txUrl } from "@/lib/chain/display";
import { appChain } from "@/lib/chain/network";
import { configuredPoolOptions, pickPool } from "@/lib/chain/pools";
import { usdcAddress } from "@/lib/chain/wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FieldLabel, Input, Select } from "@/components/ui/field";
import { Alert, PageHeader, PageMain, TextLink } from "@/components/ui/page-shell";
import { Stat, StatGrid } from "@/components/ui/stat";

import { LenderHistory } from "./history";

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
    <Suspense fallback={<PageMain><p className="text-sm text-muted">불러오는 중…</p></PageMain>}>
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
    <PageMain>
      <PageHeader
        title="담보 제출과 대출"
        description="할부계약서와 장부를 제출해 담보 한도를 갱신하고, 가용 한도 안에서 USDC를 차입합니다."
      />

      <LenderHistory address={address} refreshKey={result?.txHash} />

      <Card>
        <CardTitle>담보·대출 풀 선택</CardTitle>
        {poolOptions.length > 0 ? (
          <FieldLabel>
            등록된 풀
            <Select
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
            </Select>
          </FieldLabel>
        ) : (
          <p className="text-sm text-muted">NEXT_PUBLIC_POOL_ADDRESS 가 없으면 아래에 풀 주소를 입력하세요.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <FieldLabel className="min-w-[16rem] flex-1">
            다른 풀 주소 (팩토리 배포 등)
            <Input
              className="font-mono text-xs"
              placeholder="0x…"
              value={customPool}
              onChange={(event) => setCustomPool(event.target.value)}
            />
          </FieldLabel>
          <Button variant="secondary" type="button" onClick={applyCustomPool}>
            적용
          </Button>
        </div>
        {customError ? <Alert tone="danger">{customError}</Alert> : null}
        {activePool ? (
          <p className="text-sm text-muted">
            선택됨 <span className="font-mono text-foreground">{activePool}</span> ·{" "}
            <TextLink href={`/pool/${activePool}`}>풀 상세</TextLink>
          </p>
        ) : null}
      </Card>

      {!ready ? <Alert>풀 주소가 설정되지 않았습니다</Alert> : null}
      {readsLocalFork() ? (
        <Alert tone="warning">
          이 화면은 로컬 포크를 봅니다. 지갑에서 Localhost 8545를 선택하세요. 체인 ID는 31337입니다.
        </Alert>
      ) : null}
      {isConnected && chainId !== appChain().id ? (
        <Alert tone="warning">지갑 네트워크를 Localhost 8545로 바꿔 주세요</Alert>
      ) : null}

      <StatGrid>
        <Stat label="한도" value={usdcText(limit.data)} highlight />
        <Stat label="대출 잔액" value={usdcText(borrowed.data)} />
        <Stat label="가능액" value={usdcText(available.data)} highlight />
        <Stat label="최대 약정" value={usdcText(settings.data?.maxCommitment)} />
        <Stat label="내 USDC" value={address ? usdcText(balance.data) : "지갑 연결 필요"} />
        <Stat label="대출사 계정" value={lender.data ? shortAddress(lender.data) : "—"} />
      </StatGrid>

      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <CardTitle>담보 제출</CardTitle>
          <FieldLabel>
            할부계약서 (.pdf, .txt, 여러 개)
            <Input
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              multiple
              onChange={(event) => setContracts(Array.from(event.target.files ?? []))}
            />
          </FieldLabel>
          <FieldLabel>
            대출장부 (.csv)
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setTape(event.target.files?.[0] ?? null)}
            />
          </FieldLabel>
          <Button className="w-fit" type="submit" disabled={!ready || submitting || contracts.length === 0 || !tape}>
            {submitting ? "담보를 계산하는 중입니다" : "담보 제출"}
          </Button>
          {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        </form>
      </Card>

      {result ? <ResultCard result={result} /> : null}

      <Card>
        <form className="flex flex-col gap-4" onSubmit={onBorrow}>
          <CardTitle>대출 실행</CardTitle>
          <FieldLabel>
            요청액 (USDC)
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </FieldLabel>
          <Button className="w-fit" type="submit" disabled={!ready || !isConnected || borrowing || amount.trim() === ""}>
            {borrowing ? "대출 실행 중" : "대출 실행"}
          </Button>
          {borrowError ? <Alert tone="danger">{borrowError}</Alert> : null}
          {borrowTx ? (
            <TextLink href={txUrl(borrowTx)}>대출 거래 {shortHash(borrowTx)}</TextLink>
          ) : null}
        </form>
      </Card>
    </PageMain>
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
    <Card>
      <div className="flex items-center gap-2">
        <CardTitle>담보 결과</CardTitle>
        {result.mock ? <Badge tone="mock">Mock</Badge> : null}
      </div>
      <p className="text-sm">
        적격 <span className="font-medium text-foreground">{result.eligibleCount}건</span> ·{" "}
        {formatUsdc(BigInt(result.eligibleAmount))} USDC
      </p>
      <p className="text-sm font-medium text-warning">
        다른 풀에 담보 잡힌 차량 {result.excluded.VIN_PLEDGED_ELSEWHERE}건
      </p>
      <ul className="grid gap-1 text-sm text-muted sm:grid-cols-2">
        {rows.map(([label, count]) => (
          <li key={label}>
            {label} <span className="text-foreground">{count}</span>건
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        등록된 VIN <span className="text-foreground">{result.vinsRegistered}</span>건 · 한도{" "}
        <span className="font-medium text-accent">{formatUsdc(BigInt(result.limit))} USDC</span>
      </p>
      <TextLink href={txUrl(result.txHash)}>한도 게시 거래 {shortHash(result.txHash)}</TextLink>
    </Card>
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

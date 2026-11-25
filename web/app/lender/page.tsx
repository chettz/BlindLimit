"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { parseUnits, type Address } from "viem";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";

import { PoolPicker } from "@/components/pool-picker";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/field";
import { Alert, PageHeader, PageMain, TextLink } from "@/components/ui/page-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { loanPoolAbi, mockUsdcAbi } from "@/lib/chain/abi";
import { borrowErrorMessage, exceedsLimitMessage, formatUsdc, readsLocalFork, txUrl } from "@/lib/chain/display";
import { appChain } from "@/lib/chain/network";
import { configuredPoolOptions, pickPool } from "@/lib/chain/pools";
import { usdcAddress } from "@/lib/chain/wagmi";

const POLL_MS = 10_000;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

export default function LenderPage() {
  return (
    <Suspense
      fallback={
        <PageMain>
          <p className="text-sm text-muted">불러오는 중…</p>
        </PageMain>
      }
    >
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

  const [amount, setAmount] = useState("");
  const [borrowError, setBorrowError] = useState<string | null>(null);
  const [borrowTx, setBorrowTx] = useState<string | null>(null);

  function selectPool(next: Address) {
    setActivePool(next);
    router.replace(`/lender?pool=${next}`, { scroll: false });
  }

  async function onBorrow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePool) return;
    setBorrowError(null);
    setBorrowTx(null);

    let requested: bigint;
    try {
      requested = parseUnits(amount.replaceAll(",", ""), 6);
    } catch {
      setBorrowError("금액을 확인해 주세요");
      return;
    }
    if (requested === 0n) {
      setBorrowError("대출 금액이 0입니다");
      return;
    }
    if (available.data !== undefined && requested > available.data) {
      setBorrowError(exceedsLimitMessage(requested, available.data));
      return;
    }
    if (chainId !== appChain().id) {
      setBorrowError("지갑 네트워크를 Localhost 8545(체인 31337)로 바꿔 주세요");
      return;
    }

    try {
      const hash = await writeContractAsync({
        address: activePool,
        abi: loanPoolAbi,
        functionName: "borrow",
        args: [requested],
        chainId: appChain().id,
      });
      setBorrowTx(hash);
      await Promise.all([limit.refetch(), borrowed.refetch(), available.refetch(), balance.refetch()]);
    } catch (error) {
      setBorrowError(borrowErrorMessage(error));
    }
  }

  return (
    <PageMain>
      <PageHeader
        title="온체인 대출"
        description="검증으로 게시된 한도 안에서 USDC를 차입합니다. 계약서·장부 검증은 검증 메뉴에서 먼저 실행하세요."
        actions={
          <TextLink href={activePool ? `/verify?pool=${activePool}` : "/verify"}>계약서·장부 검증</TextLink>
        }
      />

      <PoolPicker
        title="대출 풀 선택"
        poolOptions={poolOptions}
        activePool={activePool}
        inPresetList={inPresetList}
        onSelect={selectPool}
      />

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
          {borrowTx ? <TextLink href={txUrl(borrowTx)}>대출 거래 {shortHash(borrowTx)}</TextLink> : null}
        </form>
      </Card>
    </PageMain>
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

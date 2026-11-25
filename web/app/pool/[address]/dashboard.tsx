"use client";

import { useEffect, useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";

import { loanPoolAbi } from "@/lib/chain/abi";
import { formatUsdc, txUrl } from "@/lib/chain/display";

type LimitReceipt = {
  txHash: Hex;
  docBundleHash: Hex;
  attestationHash: Hex;
  ruleHash: Hex;
  eligibleCount: bigint;
  eligibleAmount: bigint;
  newLimit: bigint;
  timestamp: bigint;
};

export function PoolDashboard({ address }: { address: Address }) {
  const { address: wallet } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending: locking } = useWriteContract();
  const [receipts, setReceipts] = useState<LimitReceipt[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  const poll = { refetchInterval: 15_000 };
  const settings = useReadContract({ address, abi: loanPoolAbi, functionName: "settings", query: poll });
  const agreementHash = useReadContract({ address, abi: loanPoolAbi, functionName: "agreementHash", query: poll });
  const settingsHash = useReadContract({ address, abi: loanPoolAbi, functionName: "settingsHash", query: poll });
  const operator = useReadContract({ address, abi: loanPoolAbi, functionName: "operator", query: poll });
  const limit = useReadContract({ address, abi: loanPoolAbi, functionName: "limit", query: poll });
  const borrowed = useReadContract({ address, abi: loanPoolAbi, functionName: "borrowed", query: poll });

  const isOperator = wallet && operator.data && wallet.toLowerCase() === operator.data.toLowerCase();

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    void (async () => {
      try {
        const logs = await publicClient.getContractEvents({
          address,
          abi: loanPoolAbi,
          eventName: "LimitUpdated",
          fromBlock: 0n,
          toBlock: "latest",
        });
        if (cancelled) return;
        const rows: LimitReceipt[] = logs
          .map((log) => {
            if (!log.args || log.transactionHash === null) return undefined;
            const args = log.args;
            if (
              args.docBundleHash === undefined ||
              args.attestationHash === undefined ||
              args.ruleHash === undefined ||
              args.eligibleCount === undefined ||
              args.eligibleAmount === undefined ||
              args.newLimit === undefined ||
              args.timestamp === undefined
            ) {
              return undefined;
            }
            return {
              txHash: log.transactionHash,
              docBundleHash: args.docBundleHash,
              attestationHash: args.attestationHash,
              ruleHash: args.ruleHash,
              eligibleCount: args.eligibleCount,
              eligibleAmount: args.eligibleAmount,
              newLimit: args.newLimit,
              timestamp: args.timestamp,
            };
          })
          .filter((row): row is LimitReceipt => row !== undefined)
          .reverse();
        setReceipts(rows);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("한도 게시 이벤트를 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient, limit.data]);

  async function tryUpdateSettings() {
    if (!settings.data) return;
    setLockMessage(null);
    try {
      await writeContractAsync({
        address,
        abi: loanPoolAbi,
        functionName: "updateSettings",
        args: [settings.data],
      } as Parameters<typeof writeContractAsync>[0]);
      setLockMessage("예상과 다르게 설정이 변경되었습니다");
    } catch (error) {
      if (error instanceof BaseError) {
        const revert = error.walk((item) => item instanceof ContractFunctionRevertedError);
        if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "SettingsLocked") {
          setLockMessage("배포 후 설정은 단독 변경 불가 (양측 서명 수정 약정 필요 — 로드맵)");
          return;
        }
      }
      setLockMessage("설정 변경 시도 실패");
    }
  }

  const s = settings.data;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <p className="font-mono text-sm">{address}</p>
        <a className="w-fit rounded-full bg-zinc-900 px-4 py-2 text-white" href={`/lender?pool=${address}`}>
          이 풀에서 담보·대출
        </a>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Stat label="한도" value={limit.data === undefined ? "—" : `${formatUsdc(limit.data)} USDC`} />
        <Stat label="차입 잔액" value={borrowed.data === undefined ? "—" : `${formatUsdc(borrowed.data)} USDC`} />
      </section>

      <section className="rounded-xl border p-4 text-sm">
        <h2 className="mb-3 text-lg font-semibold">설정 (불변)</h2>
        <p className="text-xs text-zinc-500 break-all">agreementHash {shortHex(agreementHash.data)}</p>
        <p className="text-xs text-zinc-500 break-all">settingsHash {shortHex(settingsHash.data)}</p>
        {s ? (
          <ul className="mt-3 flex flex-col gap-1">
            <li>선급률 {(Number(s.advanceRateBps) / 100).toFixed(2)}%</li>
            <li>연체 기준 {s.delinquencyCutoffDays}일</li>
            <li>금액 허용오차 {Number(s.amountToleranceCents)}센트</li>
            <li>차주 집중도 {(Number(s.obligorConcBps) / 100).toFixed(0)}%</li>
            <li>딜러 집중도 {(Number(s.dealerConcBps) / 100).toFixed(0)}%</li>
            <li>최대 약정 {formatUsdc(s.maxCommitment)} USDC</li>
          </ul>
        ) : (
          <p className="mt-2 text-zinc-500">설정 불러오는 중…</p>
        )}
      </section>

      {isOperator ? (
        <section className="flex flex-col gap-2">
          <button
            className="w-fit rounded-full border border-red-800 px-4 py-2 text-red-900 disabled:opacity-50"
            type="button"
            disabled={locking || !settings.data}
            onClick={() => void tryUpdateSettings()}
          >
            {locking ? "호출 중" : "설정 변경 시도 (데모)"}
          </button>
          {lockMessage ? <p className="text-sm">{lockMessage}</p> : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">LimitUpdated 영수증</h2>
        {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}
        {receipts.length === 0 ? <p className="text-sm text-zinc-500">아직 한도 게시 이벤트가 없습니다.</p> : null}
        {receipts.map((row) => (
          <article key={`${row.txHash}-${row.timestamp}`} className="rounded-xl border p-4 text-sm">
            <p>{formatTime(Number(row.timestamp))}</p>
            <p>적격 {row.eligibleCount.toString()}건 · {formatUsdc(row.eligibleAmount)} USDC</p>
            <p>한도 {formatUsdc(row.newLimit)} USDC</p>
            <p className="text-xs text-zinc-500 break-all">doc {shortHex(row.docBundleHash)}</p>
            <p className="text-xs text-zinc-500 break-all">attestation {shortHex(row.attestationHash)}</p>
            <p className="text-xs text-zinc-500 break-all">rule {shortHex(row.ruleHash)}</p>
            <a className="underline" href={txUrl(row.txHash)}>
              거래 {shortHex(row.txHash)}
            </a>
          </article>
        ))}
      </section>
    </div>
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

function shortHex(value: Hex | undefined): string {
  if (!value) return "—";
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString("ko-KR");
}
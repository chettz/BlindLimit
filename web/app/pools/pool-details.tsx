"use client";

import type { Address } from "viem";
import { useReadContracts } from "wagmi";

import { loanPoolAbi } from "@/lib/chain/abi";
import {
  displayAddress,
  displayBpsPercent,
  displayDays,
  displayHash,
  displayNone,
  displayToleranceCents,
  displayUsdc,
} from "@/lib/chain/poolDisplay";

export function PoolDetails({ address }: { address: Address }) {
  const poll = { enabled: true };
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address, abi: loanPoolAbi, functionName: "operator" },
      { address, abi: loanPoolAbi, functionName: "lender" },
      { address, abi: loanPoolAbi, functionName: "oracle" },
      { address, abi: loanPoolAbi, functionName: "agreementHash" },
      { address, abi: loanPoolAbi, functionName: "settings" },
      { address, abi: loanPoolAbi, functionName: "limit" },
      { address, abi: loanPoolAbi, functionName: "borrowed" },
      { address, abi: loanPoolAbi, functionName: "availableToBorrow" },
    ],
    query: poll,
  });

  if (isLoading) return <p className="py-2 text-sm text-muted">불러오는 중…</p>;

  const operator = data?.[0]?.result as Address | undefined;
  const lender = data?.[1]?.result as Address | undefined;
  const oracle = data?.[2]?.result as Address | undefined;
  const agreementHash = data?.[3]?.result as `0x${string}` | undefined;
  const settings = data?.[4]?.result as
    | {
        advanceRateBps: number;
        delinquencyCutoffDays: number;
        amountToleranceCents: number;
        obligorConcBps: number;
        dealerConcBps: number;
        maxCommitment: bigint;
      }
    | undefined;
  const limit = data?.[5]?.result as bigint | undefined;
  const borrowed = data?.[6]?.result as bigint | undefined;
  const available = data?.[7]?.result as bigint | undefined;

  const failed = data?.some((row) => row.status === "failure");

  return (
    <div className="py-3 text-sm">
      {failed ? <p className="mb-2 text-warning">일부 값을 읽지 못했습니다 — none 으로 표시합니다</p> : null}
      <dl className="grid gap-2 sm:grid-cols-2">
        <Row label="풀 운영자" value={displayAddress(operator)} />
        <Row label="담보 공급자(대출사)" value={displayAddress(lender)} />
        <Row label="오라클" value={displayAddress(oracle)} />
        <Row label="약정 해시" value={displayHash(agreementHash)} mono />
        <Row label="선급률" value={displayNone(settings?.advanceRateBps, displayBpsPercent)} />
        <Row label="연체 기준일" value={displayNone(settings?.delinquencyCutoffDays, displayDays)} />
        <Row label="금액 허용오차" value={displayNone(settings?.amountToleranceCents, displayToleranceCents)} />
        <Row label="차주 집중도" value={displayNone(settings?.obligorConcBps, displayBpsPercent)} />
        <Row label="딜러 집중도" value={displayNone(settings?.dealerConcBps, displayBpsPercent)} />
        <Row label="최대 약정액" value={displayNone(settings?.maxCommitment, displayUsdc)} />
        <Row label="담보 한도" value={displayUsdc(limit)} />
        <Row label="대출 잔액" value={displayUsdc(borrowed)} />
        <Row label="대출 가능액" value={displayUsdc(available)} />
      </dl>
      <a className="mt-3 inline-block text-xs text-accent underline-offset-2 hover:underline" href={`/pool/${address}`}>
        영수증·잠금 데모 화면
      </a>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
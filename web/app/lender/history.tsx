"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";

import { Card, CardTitle } from "@/components/ui/card";
import { TextLink } from "@/components/ui/page-shell";

import { formatUsdc, txUrl } from "@/lib/chain/display";
import { listCollateralPosts, type CollateralPostRow } from "@/lib/chain/lenderHistory";
import { factoryAddress } from "@/lib/chain/wagmi";

type AgreementRow = {
  agreementHash: Hex;
  lender: Address;
  submittedAt: number;
};

export function LenderHistory({ address, refreshKey }: { address: Address | undefined; refreshKey?: string }) {
  const client = usePublicClient();
  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [collateral, setCollateral] = useState<CollateralPostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setAgreements([]);
      setCollateral([]);
      setError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const agreementRes = await fetch(`/api/agreements?lender=${address}`);
        const agreementJson: unknown = await agreementRes.json();
        if (!agreementRes.ok) throw new Error(errorText(agreementJson));

        const posts = client ? await listCollateralPosts(client, address, factoryAddress) : [];

        if (cancelled) return;
        setAgreements(isAgreements(agreementJson) ? agreementJson.agreements : []);
        setCollateral(posts);
      } catch {
        if (!cancelled) setError("이력을 불러오지 못했습니다");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, client, refreshKey]);

  if (!address) {
    return (
      <Card>
        <CardTitle>내 서명·제출 이력</CardTitle>
        <p className="text-sm text-muted">지갑을 연결하면 약정 서명과 담보 게시 내역을 볼 수 있습니다.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>내 서명·제출 이력</CardTitle>
      {loading ? <p className="text-sm text-muted">불러오는 중…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">서명한 약정</h3>
        {agreements.length === 0 ? <p className="text-sm text-muted">등록된 약정이 없습니다.</p> : null}
        <ul className="flex flex-col gap-2">
          {agreements.map((row) => (
            <li key={row.agreementHash} className="rounded-[12px] border border-border bg-[rgba(148,151,169,0.08)] px-3 py-2 text-sm">
              <p className="font-mono text-xs break-all text-muted">{row.agreementHash}</p>
              <p className="text-xs text-muted">{new Date(row.submittedAt).toLocaleString("ko-KR")}</p>
              <TextLink className="text-xs" href="/lender/agreement">
                추가 약정 서명
              </TextLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">담보 게시(온체인)</h3>
        {collateral.length === 0 ? <p className="text-sm text-muted">게시 이력이 없습니다.</p> : null}
        <ul className="flex flex-col gap-2">
          {collateral.map((row) => (
            <li
              key={`${row.txHash}-${row.timestamp}`}
              className="rounded-[12px] border border-border bg-[rgba(148,151,169,0.08)] px-3 py-2 text-sm"
            >
              <p>
                풀 <span className="font-mono text-xs">{shortAddress(row.pool)}</span>
              </p>
              <p>
                한도 {formatUsdc(row.newLimit)} USDC · 적격 {row.eligibleCount.toString()}건
              </p>
              <p className="text-xs text-muted">{formatTime(row.timestamp)}</p>
              <TextLink className="text-xs" href={txUrl(row.txHash)}>
                거래 {shortHash(row.txHash)}
              </TextLink>
              <span className="mx-2 text-muted">·</span>
              <TextLink className="text-xs" href={`/verify?pool=${row.pool}`}>
                검증
              </TextLink>
              <span className="mx-2 text-muted">·</span>
              <TextLink className="text-xs" href={`/lender?pool=${row.pool}`}>
                대출
              </TextLink>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

function formatTime(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleString("ko-KR");
}

function errorText(json: unknown): string {
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") return json.error;
  return "요청 실패";
}

function isAgreements(json: unknown): json is { agreements: AgreementRow[] } {
  if (!json || typeof json !== "object") return false;
  const value = json as { agreements?: unknown };
  return Array.isArray(value.agreements);
}
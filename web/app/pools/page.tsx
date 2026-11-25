"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import { discoverPoolAddresses, type PoolListItem } from "@/lib/chain/discoverPools";
import { factoryAddress } from "@/lib/chain/wagmi";

import { Alert, PageHeader, PageMain, TextLink } from "@/components/ui/page-shell";

import { PoolDetails } from "./pool-details";

export default function PoolsPage() {
  const client = usePublicClient();
  const [rows, setRows] = useState<PoolListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await discoverPoolAddresses(client, factoryAddress);
        if (!cancelled) {
          setRows(list);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) setLoadError("풀 목록을 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  function toggle(address: Address) {
    const key = address.toLowerCase();
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <PageMain>
      <PageHeader
        title="배포된 풀"
        description="팩토리 배포 이벤트와 환경 변수에 등록된 풀 주소를 모읍니다."
      />

      {loadError ? <Alert tone="danger">{loadError}</Alert> : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="grid grid-cols-[1fr_auto] border-b border-border px-5 py-3 text-[13px] text-muted">
          <span>풀</span>
          <span>작업</span>
        </div>
        {rows.length === 0 && !loadError ? (
          <p className="px-5 py-10 text-sm text-muted">등록된 풀이 없습니다.</p>
        ) : null}
        <ul>
          {rows.map((row, index) => {
            const key = row.address.toLowerCase();
            const open = Boolean(expanded[key]);
            return (
              <li key={row.address} className={index < rows.length - 1 || open ? "border-b border-border" : ""}>
                <div className="flex items-center gap-3 px-5 py-4">
                  <button
                    aria-expanded={open}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] text-muted hover:bg-[rgba(148,151,169,0.08)] hover:text-foreground"
                    type="button"
                    onClick={() => toggle(row.address)}
                  >
                    <span aria-hidden className={`inline-block text-xs transition-transform ${open ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    {row.label ? <p className="text-sm font-medium">{row.label}</p> : null}
                    <p className="font-mono text-xs break-all text-muted">{row.address}</p>
                  </div>
                  <TextLink className="shrink-0 text-[13px]" href={`/lender?pool=${row.address}`}>
                    대출
                  </TextLink>
                </div>
                {open ? (
                  <div className="border-t border-border bg-surface px-5">
                    <PoolDetails address={row.address} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </PageMain>
  );
}
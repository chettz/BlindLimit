"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FieldLabel, Input, Select } from "@/components/ui/field";
import { Alert, TextLink } from "@/components/ui/page-shell";
import type { PoolOption } from "@/lib/chain/pools";

export function PoolPicker({
  title,
  poolOptions,
  activePool,
  inPresetList,
  onSelect,
}: {
  title: string;
  poolOptions: PoolOption[];
  activePool: Address | undefined;
  inPresetList: boolean;
  onSelect: (address: Address) => void;
}) {
  const [customPool, setCustomPool] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  function applyCustom() {
    const value = customPool.trim();
    if (!isAddress(value)) {
      setCustomError("풀 주소가 올바르지 않습니다");
      return;
    }
    setCustomError(null);
    onSelect(value);
  }

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {poolOptions.length > 0 ? (
        <FieldLabel>
          등록된 풀
          <Select
            value={inPresetList && activePool ? activePool : ""}
            onChange={(event) => {
              const value = event.target.value;
              if (value && isAddress(value)) onSelect(value);
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
          다른 풀 주소
          <Input
            className="font-mono text-xs"
            placeholder="0x…"
            value={customPool}
            onChange={(event) => setCustomPool(event.target.value)}
          />
        </FieldLabel>
        <Button variant="secondary" type="button" onClick={applyCustom}>
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
  );
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

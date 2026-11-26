"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { type Address } from "viem";
import { useRouter, useSearchParams } from "next/navigation";

import {
  CollateralResultCard,
  collateralErrorText,
  isCollateralResult,
  type CollateralResult,
} from "@/components/collateral-result-card";
import { PoolPicker } from "@/components/pool-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/field";
import { Alert, PageHeader, PageMain } from "@/components/ui/page-shell";
import { teeApiBase } from "@/lib/client/teeApiBase";
import { postSealedVerify } from "@/lib/client/teeClient";
import { configuredPoolOptions, pickPool } from "@/lib/chain/pools";
import { usdcAddress } from "@/lib/chain/wagmi";

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <PageMain>
          <p className="text-sm text-muted">불러오는 중…</p>
        </PageMain>
      }
    >
      <VerifyPageContent />
    </Suspense>
  );
}

function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poolParam = searchParams.get("pool");
  const poolOptions = useMemo(() => configuredPoolOptions(), []);
  const [activePool, setActivePool] = useState<Address | undefined>(() => pickPool(poolParam, poolOptions));
  const [publishOnChain, setPublishOnChain] = useState(false);
  const [contracts, setContracts] = useState<File[]>([]);
  const [tape, setTape] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CollateralResult | null>(null);
  const [sealedMock, setSealedMock] = useState(false);

  useEffect(() => {
    setActivePool(pickPool(poolParam, poolOptions));
  }, [poolParam, poolOptions]);

  const inPresetList = poolOptions.some((row) => row.address.toLowerCase() === activePool?.toLowerCase());
  const canPublish = Boolean(activePool && usdcAddress);
  const canSubmit = contracts.length > 0 && tape !== null && (!publishOnChain || canPublish);
  const remoteTee = teeApiBase().length > 0;

  function selectPool(next: Address) {
    setActivePool(next);
    router.replace(`/verify?pool=${next}`, { scroll: false });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tape || contracts.length === 0) return;
    if (publishOnChain && !activePool) return;
    setSubmitting(true);
    setSubmitError(null);
    setSealedMock(false);
    try {
      if (!publishOnChain) {
        const sealed = await postSealedVerify({
          contracts,
          tape,
          pool: activePool,
        });
        if (!sealed.ok) {
          setResult(null);
          setSubmitError(collateralErrorText(sealed.json));
          return;
        }
        if (!isCollateralResult(sealed.json)) {
          setResult(null);
          setSubmitError("검증에 실패했습니다");
          return;
        }
        setSealedMock(sealed.json.mock);
        setResult(sealed.json);
        return;
      }

      const body = new FormData();
      for (const file of contracts) body.append("contracts", file);
      body.append("tape", tape);
      body.append("publish", "1");
      if (activePool) body.append("pool", activePool);
      const query = activePool ? `?pool=${activePool}` : "";
      const response = await fetch(`/api/collateral${query}`, { method: "POST", body });
      const json: unknown = await response.json();
      if (!response.ok) {
        setResult(null);
        setSubmitError(collateralErrorText(json));
        return;
      }
      if (!isCollateralResult(json)) {
        setResult(null);
        setSubmitError("검증에 실패했습니다");
        return;
      }
      setResult(json);
    } catch {
      setSubmitError("검증에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageMain>
      <PageHeader
        title="계약서·장부 검증"
        description="할부계약서와 대출장부를 TEE환경에서 처리합니다. 업로드한 파일은 tee환경에서만 복호화되어 처리되고 외부로 유출되지 않습니다."
      />

      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>계약서·장부 업로드</CardTitle>
            {!publishOnChain ? <Badge tone="mock">암호 업로드</Badge> : null}
            {remoteTee ? <Badge tone="accent">원격 TEE API</Badge> : null}
            {sealedMock || result?.mock ? <Badge tone="mock">MOCK</Badge> : null}
          </div>
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
          <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={publishOnChain}
              onChange={(event) => setPublishOnChain(event.target.checked)}
            />
            <span>온체인 풀에 담보 한도 게시</span>
          </label>
          <Button className="w-fit" type="submit" disabled={!canSubmit || submitting}>
            {submitting ? "검증 중" : publishOnChain ? "검증 후 게시" : "검증만 실행"}
          </Button>
          {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
        </form>
      </Card>

      {publishOnChain ? (
        <>
          <PoolPicker
            title="게시할 풀"
            poolOptions={poolOptions}
            activePool={activePool}
            inPresetList={inPresetList}
            onSelect={selectPool}
          />
          {!canPublish ? <Alert>풀 주소가 설정되지 않았습니다</Alert> : null}
        </>
      ) : null}

      {result ? (
        <CollateralResultCard
          result={result}
          borrowHref={
            result.published !== false && result.txHash && activePool
              ? `/lender?pool=${activePool}`
              : undefined
          }
        />
      ) : null}
    </PageMain>
  );
}

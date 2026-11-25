"use client";

import { useEffect, useState, type FormEvent } from "react";
import { parseUnits, type Address, type Hex } from "viem";
import { useAccount, useSignMessage, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { poolFactoryAbi } from "@/lib/chain/poolFactoryAbi";
import { poolCreatedAddress, settingsTuple, type AgreementDetail } from "@/lib/chain/factory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/field";
import { Alert, PageHeader, PageMain, TextLink } from "@/components/ui/page-shell";

import { factoryAddress, oracleAddress, usdcAddress } from "@/lib/chain/wagmi";

type FieldRow = {
  name: string;
  labelKo: string;
  agreement: string;
  setting: string;
  match: boolean;
};

type CheckResult = {
  agreementHash: string;
  fields: FieldRow[];
  ok: boolean;
  mock: boolean;
};

type AgreementItem = {
  agreementHash: Hex;
  lender: Address;
  submittedAt: number;
};

const DEFAULT = {
  advanceRatePercent: "85",
  delinquencyCutoffDays: "30",
  amountToleranceDollars: "1",
  obligorConcPercent: "10",
  dealerConcPercent: "30",
  maxCommitmentUsdc: "500000",
};

export default function OperatorPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const { writeContractAsync, isPending: deploying } = useWriteContract();

  const [catalog, setCatalog] = useState<AgreementItem[]>([]);
  const [selectedHash, setSelectedHash] = useState<Hex | null>(null);
  const [detail, setDetail] = useState<AgreementDetail | null>(null);
  const [advanceRatePercent, setAdvanceRatePercent] = useState(DEFAULT.advanceRatePercent);
  const [delinquencyCutoffDays, setDelinquencyCutoffDays] = useState(DEFAULT.delinquencyCutoffDays);
  const [amountToleranceDollars, setAmountToleranceDollars] = useState(DEFAULT.amountToleranceDollars);
  const [obligorConcPercent, setObligorConcPercent] = useState(DEFAULT.obligorConcPercent);
  const [dealerConcPercent, setDealerConcPercent] = useState(DEFAULT.dealerConcPercent);
  const [maxCommitmentUsdc, setMaxCommitmentUsdc] = useState(DEFAULT.maxCommitmentUsdc);

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [deployTx, setDeployTx] = useState<Hex | undefined>();
  const [lastPool, setLastPool] = useState<Address | null>(null);

  const { data: deployReceipt } = useWaitForTransactionReceipt({ hash: deployTx });

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!selectedHash) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedHash);
  }, [selectedHash]);

  useEffect(() => {
    if (!deployReceipt) return;
    const pool = poolCreatedAddress(deployReceipt);
    if (!pool) return;
    setLastPool(pool);
    void fetch("/api/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: pool, txHash: deployReceipt.transactionHash }),
    });
  }, [deployReceipt]);

  async function loadCatalog() {
    try {
      const response = await fetch("/api/agreements");
      const json: unknown = await response.json();
      if (!response.ok || !isCatalog(json)) return;
      setCatalog(json.agreements);
    } catch {
      setError("약정 목록을 불러오지 못했습니다");
    }
  }

  async function loadDetail(hash: Hex) {
    setResult(null);
    setError(null);
    try {
      const response = await fetch(`/api/agreements/${hash}`);
      const json: unknown = await response.json();
      if (!response.ok || !isDetail(json)) {
        setDetail(null);
        setError(errorText(json));
        return;
      }
      setDetail(json);
    } catch {
      setDetail(null);
      setError("약정 정보를 불러오지 못했습니다");
    }
  }

  async function onCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHash) return;
    setChecking(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append("agreementHash", selectedHash);
    try {
      const settings = readSettingsFields();
      body.append("advanceRateBps", String(settings.advanceRateBps));
      body.append("delinquencyCutoffDays", String(settings.delinquencyCutoffDays));
      body.append("amountToleranceCents", String(settings.amountToleranceCents));
      body.append("obligorConcBps", String(settings.obligorConcBps));
      body.append("dealerConcBps", String(settings.dealerConcBps));
      body.append("maxCommitment", settings.maxCommitment.toString());
    } catch {
      setChecking(false);
      setError("설정 숫자가 올바르지 않습니다");
      return;
    }

    try {
      const response = await fetch("/api/agreement/check", { method: "POST", body });
      const json: unknown = await response.json();
      if (!response.ok) {
        setError(errorText(json));
        return;
      }
      if (!isCheckResult(json)) {
        setError("약정 대조 실패");
        return;
      }
      setResult(json);
    } catch {
      setError("약정 대조 실패");
    } finally {
      setChecking(false);
    }
  }

  async function onDeploy() {
    if (!detail || !result?.ok || !factoryAddress || !usdcAddress || !oracleAddress || !address) return;
    setError(null);
    try {
      const settings = readSettingsFields();
      const operatorSig = await signMessageAsync({ message: { raw: detail.agreementHash } });
      const hash = await writeContractAsync({
        address: factoryAddress,
        abi: poolFactoryAbi,
        functionName: "createPool",
        args: [
          usdcAddress,
          detail.lender,
          oracleAddress,
          detail.agreementHash,
          settingsTuple({
            advanceRateBps: settings.advanceRateBps,
            delinquencyCutoffDays: settings.delinquencyCutoffDays,
            amountToleranceCents: settings.amountToleranceCents,
            obligorConcBps: settings.obligorConcBps,
            dealerConcBps: settings.dealerConcBps,
            maxCommitment: settings.maxCommitment,
          }),
          detail.lenderSig,
          operatorSig,
        ],
      });
      setDeployTx(hash);
    } catch {
      setError("풀 배포 실패");
    }
  }

  function readSettingsFields() {
    return {
      advanceRateBps: percentToBps(advanceRatePercent),
      delinquencyCutoffDays: Number(delinquencyCutoffDays),
      amountToleranceCents: dollarsToCents(amountToleranceDollars),
      obligorConcBps: percentToBps(obligorConcPercent),
      dealerConcBps: percentToBps(dealerConcPercent),
      maxCommitment: parseUnits(maxCommitmentUsdc.trim() || "0", 6),
    };
  }

  const canDeploy =
    Boolean(result?.ok && detail && factoryAddress && usdcAddress && oracleAddress && isConnected && !deploying && !signing);

  return (
    <PageMain>
      <PageHeader
        title="약정 선택·배포"
        description="대출사가 서명한 약정만 선택해 대조 후 팩토리로 풀을 배포합니다. 동일 약정으로도 여러 풀을 배포할 수 있습니다."
      />
      <TextLink href="/pools">배포된 풀 목록</TextLink>

      <Card>
        <CardTitle>서명된 약정</CardTitle>
        {catalog.length === 0 ? <p className="text-sm text-muted">등록된 약정이 없습니다.</p> : null}
        <ul className="flex flex-col gap-2">
          {catalog.map((item) => (
            <li key={item.agreementHash}>
              <button
                className={`w-full rounded-[12px] border px-3 py-2.5 text-left text-sm transition ${
                  selectedHash === item.agreementHash
                    ? "border-accent bg-accent-muted"
                    : "border-border bg-white hover:border-accent-hover"
                }`}
                type="button"
                onClick={() => setSelectedHash(item.agreementHash)}
              >
                <p className="font-mono text-xs text-muted">{item.agreementHash.slice(0, 14)}…</p>
                <p className="text-foreground">대출사 {item.lender.slice(0, 10)}…</p>
                <p className="text-xs text-muted">{new Date(item.submittedAt).toLocaleString("ko-KR")}</p>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <form className="flex flex-col gap-4" onSubmit={onCheck}>
          <CardTitle>풀 설정 (약정과 대조)</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="선급률 (%)" value={advanceRatePercent} onChange={setAdvanceRatePercent} />
          <NumberField label="연체 기준일 (일)" value={delinquencyCutoffDays} onChange={setDelinquencyCutoffDays} />
          <NumberField label="금액 허용오차 (USD)" value={amountToleranceDollars} onChange={setAmountToleranceDollars} />
          <NumberField label="차주 집중도 (%)" value={obligorConcPercent} onChange={setObligorConcPercent} />
          <NumberField label="딜러 집중도 (%)" value={dealerConcPercent} onChange={setDealerConcPercent} />
          <NumberField label="최대 약정액 (USDC)" value={maxCommitmentUsdc} onChange={setMaxCommitmentUsdc} />
        </div>

          <Button className="w-fit" variant="secondary" type="submit" disabled={!selectedHash || checking}>
            {checking ? "대조 중" : "약정 대조"}
          </Button>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </form>
      </Card>

      {result ? <CompareCard result={result} /> : null}

      <Button className="w-fit" disabled={!canDeploy} onClick={() => void onDeploy()}>
        {deploying || signing ? "배포 중" : "풀 배포 (팩토리)"}
      </Button>
      {lastPool ? (
        <Card className="border-success/30 bg-success-muted">
          <p className="text-sm font-medium text-success">최근 배포한 풀</p>
          <p className="font-mono text-xs break-all text-foreground">{lastPool}</p>
          <div className="flex flex-wrap gap-3">
            <TextLink href={`/pool/${lastPool}`}>풀 상세</TextLink>
            <TextLink href="/pools">풀 목록</TextLink>
            <TextLink href={`/lender?pool=${lastPool}`}>대출사 화면</TextLink>
          </div>
        </Card>
      ) : null}
      {!factoryAddress ? <Alert tone="danger">NEXT_PUBLIC_FACTORY_ADDRESS 가 없습니다</Alert> : null}
      {!oracleAddress ? <Alert tone="danger">NEXT_PUBLIC_ORACLE_ADDRESS 가 없습니다</Alert> : null}
    </PageMain>
  );
}

function CompareCard({ result }: { result: CheckResult }) {
  const mismatches = result.fields.filter((field) => !field.match);
  return (
    <Card className={result.ok ? "border-success/25" : "border-danger/30"}>
      <div className="flex items-center gap-2">
        <CardTitle>{result.ok ? "배포 가능" : "배포 차단"}</CardTitle>
        {result.mock ? <Badge tone="mock">Mock</Badge> : null}
        <Badge tone={result.ok ? "success" : "danger"}>{result.ok ? "OK" : "Blocked"}</Badge>
      </div>
      {!result.ok && mismatches.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {mismatches.map((field) => (
            <li key={field.name}>
              {field.labelKo} 약정서 {field.agreement} ≠ 설정 {field.setting} — 배포 차단
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto rounded-[12px] border border-border">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium text-muted">
              <th className="px-3 py-2 font-medium">항목</th>
              <th className="px-3 py-2 font-medium">약정서</th>
              <th className="px-3 py-2 font-medium">설정</th>
            </tr>
          </thead>
          <tbody>
            {result.fields.map((field) => (
              <tr
                key={field.name}
                className={field.match ? "border-b border-border/60" : "bg-danger-muted text-danger"}
              >
                <td className="px-3 py-2">{field.labelKo}</td>
                <td className="px-3 py-2">{field.agreement}</td>
                <td className="px-3 py-2">{field.setting}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <FieldLabel>
      {label}
      <Input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </FieldLabel>
  );
}

function percentToBps(percent: string): number {
  const value = Number(percent);
  if (!Number.isFinite(value) || value < 0) throw new Error("invalid");
  return Math.round(value * 100);
}

function dollarsToCents(dollars: string): number {
  const value = Number(dollars);
  if (!Number.isFinite(value) || value < 0) throw new Error("invalid");
  return Math.round(value * 100);
}

function errorText(json: unknown): string {
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") return json.error;
  return "요청 실패";
}

function isCatalog(json: unknown): json is { agreements: AgreementItem[] } {
  if (!json || typeof json !== "object") return false;
  const value = json as { agreements?: unknown };
  return Array.isArray(value.agreements);
}

function isDetail(json: unknown): json is AgreementDetail {
  if (!json || typeof json !== "object") return false;
  const value = json as Partial<AgreementDetail>;
  return (
    typeof value.agreementHash === "string" &&
    typeof value.lender === "string" &&
    typeof value.lenderSig === "string" &&
    typeof value.submittedAt === "number"
  );
}

function isCheckResult(json: unknown): json is CheckResult {
  if (!json || typeof json !== "object") return false;
  const value = json as Partial<CheckResult>;
  return typeof value.ok === "boolean" && Array.isArray(value.fields);
}
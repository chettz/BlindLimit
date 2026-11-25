"use client";

import { useState, type FormEvent } from "react";
import { keccak256, type Hex } from "viem";
import { useAccount, useSignMessage } from "wagmi";

import { AGREEMENT_ACCEPT } from "@/lib/agreements/formats";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/field";
import { Alert, PageHeader, PageMain } from "@/components/ui/page-shell";

export default function LenderAgreementPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();

  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ agreementHash: Hex; submittedAt: number } | null>(null);

  async function onHashFile(selected: File | null) {
    setFile(selected);
    setHash(null);
    setDone(null);
    setError(null);
    if (!selected) return;
    const bytes = new Uint8Array(await selected.arrayBuffer());
    setHash(keccak256(bytes));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !hash || !address) return;
    setSubmitting(true);
    setError(null);
    try {
      const signature = await signMessageAsync({ message: { raw: hash } });
      const body = new FormData();
      body.append("agreement", file);
      body.append("agreementHash", hash);
      body.append("lender", address);
      body.append("lenderSig", signature);
      const response = await fetch("/api/agreements", { method: "POST", body });
      const json: unknown = await response.json();
      if (!response.ok) {
        setError(errorText(json));
        return;
      }
      if (!isSaved(json)) {
        setError("약정 등록 실패");
        return;
      }
      setDone({ agreementHash: json.agreementHash, submittedAt: json.submittedAt });
    } catch {
      setError("서명 또는 업로드 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageMain>
      <PageHeader
        title="약정서 서명"
        description="약정서(PDF·TXT·이미지) 바이트 해시에 서명하면 운영자가 같은 약정으로 풀을 배포할 수 있습니다."
      />

      <Card>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <CardTitle>약정 업로드</CardTitle>
          <FieldLabel>
            약정서 (PDF · TXT · 이미지)
            <Input accept={AGREEMENT_ACCEPT} type="file" onChange={(event) => onHashFile(event.target.files?.[0] ?? null)} />
          </FieldLabel>
          {hash ? (
            <p className="font-mono text-xs text-muted">
              약정 해시 <span className="text-foreground">{hash.slice(0, 18)}…</span>
            </p>
          ) : null}
          <Button className="w-fit" type="submit" disabled={!file || !isConnected || submitting || signing}>
            {submitting || signing ? "처리 중" : "서명 후 등록"}
          </Button>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </form>
      </Card>

      {done ? (
        <Card className="border-success/25">
          <CardTitle>등록 완료</CardTitle>
          <p className="font-mono text-xs break-all text-muted">{done.agreementHash}</p>
          <p className="text-xs text-muted">{new Date(done.submittedAt).toLocaleString("ko-KR")}</p>
        </Card>
      ) : null}
    </PageMain>
  );
}

function errorText(json: unknown): string {
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") return json.error;
  return "약정 등록 실패";
}

function isSaved(json: unknown): json is { agreementHash: Hex; submittedAt: number } {
  if (!json || typeof json !== "object") return false;
  const row = json as { agreementHash?: unknown; submittedAt?: unknown };
  return typeof row.agreementHash === "string" && typeof row.submittedAt === "number";
}
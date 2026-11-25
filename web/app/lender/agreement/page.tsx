"use client";

import { useState, type FormEvent } from "react";
import { keccak256, type Hex } from "viem";
import { useAccount, useConnect, useSignMessage } from "wagmi";

import { AGREEMENT_ACCEPT } from "@/lib/agreements/formats";

export default function LenderAgreementPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">대출사 — 약정서 서명</h1>
        <p className="text-sm text-zinc-600">
          약정서(PDF·TXT·이미지) 바이트 해시에 서명하면 운영자가 같은 약정으로 풀을 배포할 수 있습니다.
        </p>
      </header>

      {!isConnected ? (
        <button
          className="w-fit rounded-full bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          type="button"
          disabled={connecting}
          onClick={() => connect({ connector: connectors[0] })}
        >
          지갑 연결
        </button>
      ) : (
        <p className="text-sm">연결됨 {address}</p>
      )}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          약정서 (PDF · TXT · 이미지)
          <input accept={AGREEMENT_ACCEPT} className="text-sm" type="file" onChange={(event) => onHashFile(event.target.files?.[0] ?? null)} />
        </label>
        {hash ? <p className="text-xs text-zinc-500">약정 해시 {hash.slice(0, 18)}…</p> : null}
        <button
          className="w-fit rounded-full bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          type="submit"
          disabled={!file || !isConnected || submitting || signing}
        >
          {submitting || signing ? "처리 중" : "서명 후 등록"}
        </button>
        {error ? <p className="text-red-700">{error}</p> : null}
      </form>

      {done ? (
        <section className="rounded-xl border p-4 text-sm">
          <p className="font-semibold">등록 완료</p>
          <p>해시 {done.agreementHash}</p>
          <p className="text-zinc-500">{new Date(done.submittedAt).toLocaleString("ko-KR")}</p>
        </section>
      ) : null}
    </main>
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
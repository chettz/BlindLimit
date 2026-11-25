import { BaseError, ContractFunctionRevertedError, formatUnits } from "viem";

export function formatUsdc(value: bigint): string {
  return formatUnits(value, 6);
}

export function txUrl(hash: string, rpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? ""): string {
  const local = rpc.includes("127.0.0.1") || rpc.includes("localhost");
  const base = local ? "http://localhost:5100/tx/" : "https://sepolia.basescan.org/tx/";
  return `${base}${hash}`;
}

export function readsLocalFork(rpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? ""): boolean {
  return rpc.includes("127.0.0.1") || rpc.includes("localhost");
}

export function borrowErrorMessage(error: unknown): string {
  if (!(error instanceof BaseError)) return "대출 실행에 실패했습니다";
  const revert = error.walk((item) => item instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return "대출 실행에 실패했습니다";

  const name = revert.data?.errorName;
  if (name === "ExceedsLimit") {
    const requested = bigintArg(revert.data?.args, 0);
    const available = bigintArg(revert.data?.args, 1);
    if (requested === undefined || available === undefined) return "한도 초과 — 거래 거부됨";
    return `한도 초과 — 가능액 ${formatUsdc(available)} USDC, 요청 ${formatUsdc(requested)} USDC (거래 거부됨)`;
  }
  if (name === "NotLender") return "연결된 지갑이 이 풀의 대출사 계정이 아닙니다";
  if (name === "ZeroAmount") return "대출 금액이 0입니다";
  return "대출 실행에 실패했습니다";
}

function bigintArg(args: readonly unknown[] | undefined, index: number): bigint | undefined {
  const value = args?.[index];
  return typeof value === "bigint" ? value : undefined;
}

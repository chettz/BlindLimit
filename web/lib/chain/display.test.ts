import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";

import { loanPoolAbi } from "./abi";
import { borrowErrorMessage, txUrl } from "./display";

function reverted(errorName: "ExceedsLimit" | "NotLender" | "ZeroAmount", args?: readonly [bigint, bigint]) {
  const data = encodeErrorResult({ abi: loanPoolAbi, errorName, args });
  const revert = new ContractFunctionRevertedError({ abi: loanPoolAbi, data, functionName: "borrow" });
  return new BaseError("The contract function reverted.", { cause: revert });
}

describe("borrowErrorMessage", () => {
  it("names the available and requested amounts when the limit is exceeded", () => {
    const error = reverted("ExceedsLimit", [2_000_000_000n, 1_000_000_000n]);
    expect(borrowErrorMessage(error)).toBe("한도 초과 — 가능액 1000 USDC, 요청 2000 USDC (거래 거부됨)");
  });

  it("names the lender check", () => {
    expect(borrowErrorMessage(reverted("NotLender"))).toBe("연결된 지갑이 이 풀의 대출사 계정이 아닙니다");
  });
});

describe("txUrl", () => {
  it("points a local fork at the local explorer and Base Sepolia at the public explorer", () => {
    expect(txUrl("0xabc", "http://127.0.0.1:8545")).toBe("http://localhost:5100/tx/0xabc");
    expect(txUrl("0xabc", "https://sepolia.base.org")).toBe("https://sepolia.basescan.org/tx/0xabc");
  });
});

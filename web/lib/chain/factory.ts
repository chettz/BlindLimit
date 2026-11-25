import { decodeEventLog, type Address, type Hex, type TransactionReceipt } from "viem";

import { poolFactoryAbi } from "./poolFactoryAbi";

export function poolCreatedAddress(receipt: TransactionReceipt): Address | undefined {
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({ abi: poolFactoryAbi, data: log.data, topics: log.topics });
      if (event.eventName === "PoolCreated") return event.args.pool;
    } catch {
      continue;
    }
  }
  return undefined;
}

export type PoolSettingsInput = {
  advanceRateBps: number;
  delinquencyCutoffDays: number;
  amountToleranceCents: number;
  obligorConcBps: number;
  dealerConcBps: number;
  maxCommitment: bigint;
};

export function settingsTuple(input: PoolSettingsInput) {
  return {
    advanceRateBps: input.advanceRateBps,
    delinquencyCutoffDays: input.delinquencyCutoffDays,
    amountToleranceCents: input.amountToleranceCents,
    obligorConcBps: input.obligorConcBps,
    dealerConcBps: input.dealerConcBps,
    maxCommitment: input.maxCommitment,
  } as const;
}

export type AgreementDetail = {
  agreementHash: Hex;
  lender: Address;
  lenderSig: Hex;
  submittedAt: number;
};
import {
  BaseError,
  ContractFunctionRevertedError,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { collateralRegistryAbi, loanPoolAbi } from "./abi";
import type { ChainPort, PostLimitArgs } from "../pipeline";

const postAbi = [...loanPoolAbi, ...collateralRegistryAbi] as Abi;

type SettingsResult = {
  advanceRateBps: number | bigint;
  delinquencyCutoffDays: number | bigint;
  amountToleranceCents: number | bigint;
  obligorConcBps: number | bigint;
  dealerConcBps: number | bigint;
  maxCommitment: number | bigint;
};

type Rpc = {
  readContract(args: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    account?: ReturnType<typeof privateKeyToAccount>;
  }): Promise<unknown>;
  simulateContract(args: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    account: ReturnType<typeof privateKeyToAccount>;
  }): Promise<unknown>;
  waitForTransactionReceipt(args: { hash: Hex }): Promise<{ status: "success" | "reverted" }>;
};

type Signer = {
  writeContract(args: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    account: ReturnType<typeof privateKeyToAccount>;
    chain: unknown;
  }): Promise<Hex>;
  chain?: unknown;
};

export function createPoolChain(opts: {
  publicClient: object;
  walletClient: object;
  registry: Address;
  oracleKey: Hex;
}): ChainPort {
  const publicClient = opts.publicClient as Rpc;
  const walletClient = opts.walletClient as Signer;
  const account = privateKeyToAccount(opts.oracleKey);

  return {
    async readSettings(pool) {
      const settings = (await publicClient.readContract({
        address: pool,
        abi: loanPoolAbi,
        functionName: "settings",
      })) as SettingsResult;
      return {
        advanceRateBps: Number(settings.advanceRateBps),
        delinquencyCutoffDays: Number(settings.delinquencyCutoffDays),
        amountToleranceCents: BigInt(settings.amountToleranceCents),
        obligorConcBps: Number(settings.obligorConcBps),
        dealerConcBps: Number(settings.dealerConcBps),
        maxCommitment: BigInt(settings.maxCommitment),
      };
    },

    async checkBatch(vinHashes) {
      const holders = (await publicClient.readContract({
        address: opts.registry,
        abi: collateralRegistryAbi,
        functionName: "checkBatch",
        args: [vinHashes],
      })) as readonly Address[];
      return [...holders];
    },

    async postLimit(pool, args) {
      try {
        await publicClient.simulateContract({
          address: pool,
          abi: postAbi,
          functionName: "postLimit",
          args: postArgs(args),
          account,
        });
      } catch (error) {
        return { txHash: "", status: "reverted", revertName: revertName(error) };
      }

      const txHash = await walletClient.writeContract({
        address: pool,
        abi: postAbi,
        functionName: "postLimit",
        args: postArgs(args),
        account,
        chain: walletClient.chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "reverted") return { txHash, status: "reverted", revertName: "Reverted" };
      return { txHash, status: "success" };
    },
  };
}

function postArgs(args: PostLimitArgs) {
  return [
    args.docBundleHash,
    args.attestationHash,
    args.ruleHash,
    BigInt(args.eligibleCount),
    args.eligibleAmount,
    args.limit,
    args.eligibleVinHashes,
  ] as const;
}

function revertName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined;
  return reverted.data?.errorName;
}

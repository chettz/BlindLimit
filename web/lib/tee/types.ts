import { z } from "zod";

const digits = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform(String);
const wholeNumber = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]);

export const contractTermsSchema = z.object({
  contractNo: z.string().optional().default(""),
  vin: z.string().trim().min(11).max(40),
  obligorName: z.string().optional().default(""),
  dealerName: z.string().optional().default(""),
  principalCents: digits,
  annualRateBps: wholeNumber,
  daysPastDue: wholeNumber.optional().default(0),
});

export const agreementTermsSchema = z.object({
  advanceRateBps: z.number().int().nonnegative(),
  delinquencyCutoffDays: z.number().int().nonnegative(),
  amountToleranceCents: z.number().int().nonnegative(),
  obligorConcBps: z.number().int().nonnegative(),
  dealerConcBps: z.number().int().nonnegative(),
  maxCommitment: digits,
});

export type ContractTerms = z.infer<typeof contractTermsSchema>;
export type AgreementTerms = z.infer<typeof agreementTermsSchema>;

export type TeeSignature = {
  text: string;
  signature: string;
  signingAddress: string;
  signingAlgo: "ecdsa";
};

export type TeeResult<T> = {
  data: T;
  chatId?: string;
  signature?: TeeSignature;
  mock: boolean;
};

export type TeeDocument = {
  text?: string;
  imagePngBase64?: string;
};

export interface TeeProvider {
  extractInstallmentContract(doc: TeeDocument): Promise<TeeResult<ContractTerms>>;
  extractAgreementTerms(doc: TeeDocument): Promise<TeeResult<AgreementTerms>>;
  getAttestation(nonce: string): Promise<{ raw: unknown; mock: boolean }>;
}

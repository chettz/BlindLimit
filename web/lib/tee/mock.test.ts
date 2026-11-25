import { describe, expect, it } from "vitest";

import { createMockProvider } from "./mock";

const contractText = [
  "contractNo: C-1",
  "vin: 1HGCM82633A004352",
  "obligorName: OBLIGOR",
  "dealerName: DEALER",
  "principalCents: 1000000",
  "annualRateBps: 8500",
  "daysPastDue: 0",
].join("\n");

const agreementText = [
  "advanceRateBps: 8500",
  "delinquencyCutoffDays: 30",
  "amountToleranceCents: 100",
  "obligorConcBps: 1000",
  "dealerConcBps: 4000",
  "maxCommitment: 500000000000",
].join("\n");

describe("mock provider", () => {
  const provider = createMockProvider();

  it("extracts contract fields without a signature", async () => {
    const result = await provider.extractInstallmentContract({ text: contractText });
    expect(result.mock).toBe(true);
    expect(result.signature).toBeUndefined();
    expect(result.data).toEqual({
      contractNo: "C-1",
      vin: "1HGCM82633A004352",
      obligorName: "OBLIGOR",
      dealerName: "DEALER",
      principalCents: "1000000",
      annualRateBps: 8500,
      daysPastDue: 0,
    });
  });

  it("extracts agreement fields", async () => {
    const result = await provider.extractAgreementTerms({ text: agreementText });
    expect(result.mock).toBe(true);
    expect(result.data.advanceRateBps).toBe(8500);
    expect(result.data.amountToleranceCents).toBe(100);
    expect(result.data.maxCommitment).toBe("500000000000");
  });

  it("returns a mock attestation", async () => {
    await expect(provider.getAttestation("abcd")).resolves.toEqual({ raw: { mock: true }, mock: true });
  });
});

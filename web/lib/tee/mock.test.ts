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

  it("reads vin, amount financed, and apr from the three contract layouts", async () => {
    const formA = ["Vehicle Identification Number: 1HGCM82633A004352", "29.90 %", "5. Amount Financed (3 + 4) $12,288.44"].join("\n");
    const formB = "Vehicle Identification Number 4t1bf1fk5cu514589. USD 18788.44 is financed at an annual percentage rate of 15.9 percent.";
    const formC = ["SERIAL / VIN          : 5NP JREZK 8 JJ 804765", "PRINCIPAL FINANCED    : 17863.44 USD", "RATE (APR)            : 27.9%"].join("\n");

    await expect(provider.extractInstallmentContract({ text: formA })).resolves.toMatchObject({
      mock: true,
      data: { vin: "1HGCM82633A004352", principalCents: "1228844", annualRateBps: 2990 },
    });
    await expect(provider.extractInstallmentContract({ text: formB })).resolves.toMatchObject({
      data: { vin: "4T1BF1FK5CU514589", principalCents: "1878844", annualRateBps: 1590 },
    });
    await expect(provider.extractInstallmentContract({ text: formC })).resolves.toMatchObject({
      data: { vin: "5NPJREZK8JJ804765", principalCents: "1786344", annualRateBps: 2790 },
    });
  });

  it("returns a mock attestation", async () => {
    await expect(provider.getAttestation("abcd")).resolves.toEqual({ raw: { mock: true }, mock: true });
  });
});

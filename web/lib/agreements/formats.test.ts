import { describe, expect, it } from "vitest";

import { isAgreementFileName } from "./formats";

describe("isAgreementFileName", () => {
  it("accepts pdf txt and common images", () => {
    expect(isAgreementFileName("terms.pdf")).toBe(true);
    expect(isAgreementFileName("terms.TXT")).toBe(true);
    expect(isAgreementFileName("scan.png")).toBe(true);
    expect(isAgreementFileName("scan.jpeg")).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(isAgreementFileName("terms.docx")).toBe(false);
    expect(isAgreementFileName("notes.csv")).toBe(false);
  });
});
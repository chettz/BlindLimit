import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";

import { normalizeVin, vinHash } from "./vin";

describe("normalizeVin", () => {
  it("uppercases and strips spaces and hyphens", () => {
    expect(normalizeVin("1hgcm82633a004352")).toBe("1HGCM82633A004352");
    expect(normalizeVin("1HGCM82633A-004352")).toBe("1HGCM82633A004352");
  });

  it("rejects the wrong length and I, O, Q", () => {
    expect(normalizeVin("SHORT")).toBeNull();
    expect(normalizeVin("1HGCM82633A00435I")).toBeNull();
    expect(normalizeVin("1HGCM82633A00435O")).toBeNull();
    expect(normalizeVin("1HGCM82633A00435Q")).toBeNull();
  });
});

describe("vinHash", () => {
  it("hashes the normalized VIN and salt", () => {
    expect(vinHash("1hgcm82633a-004352", "pepper")).toBe(keccak256(toBytes("1HGCM82633A004352pepper")));
  });

  it("returns null for an invalid VIN", () => {
    expect(vinHash("NOT-A-VIN", "pepper")).toBeNull();
  });
});

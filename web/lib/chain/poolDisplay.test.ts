import { describe, expect, it } from "vitest";

import { displayHash, displayNone } from "./poolDisplay";

describe("poolDisplay", () => {
  it('shows "none" for missing values', () => {
    expect(displayNone(undefined, String)).toBe("none");
    expect(displayHash(undefined)).toBe("none");
    expect(displayHash("0x0000000000000000000000000000000000000000000000000000000000000000")).toBe("none");
  });
});
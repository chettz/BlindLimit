import "server-only";

import { createMockProvider } from "./mock";
import { createNearAiProvider } from "./nearai";
import type { TeeProvider } from "./types";

export function getTeeProvider(): TeeProvider {
  const name = process.env.TEE_PROVIDER ?? "mock";
  if (name === "mock") return createMockProvider();
  if (name === "nearai") return createNearAiProvider();
  throw new Error("TEE_PROVIDER 는 mock 또는 nearai 여야 합니다");
}

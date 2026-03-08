/**
 * Usage (/v1/usage) — SDK integration test.
 *
 * Verifies the usage endpoint returns subscription and feature usage data.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/usage.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioUsage, type UsageResult } from "./scenarios.js";

describe("Usage (/v1/usage)", () => {
  let env: TestEnv;
  let result: UsageResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should return subscription and usage data", async () => {
    result = await scenarioUsage(env.client);

    expect(typeof result.hasSubscription).toBe("boolean");

    if (result.hasSubscription) {
      expect(result.tier).toBeTruthy();
      expect(result.tierDisplayName).toBeTruthy();
      expect(result.featureCount).toBeGreaterThan(0);
      expect(typeof result.daysRemaining).toBe("number");
    }
  });
});

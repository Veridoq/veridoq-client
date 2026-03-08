/**
 * Invalid API Key Rejection — SDK integration test.
 *
 * Mirrors the InvalidApiKeyTestSuite from the browser test runner.
 * This test does NOT require a valid API key — it verifies that a bad key is rejected.
 *
 * Run:
 *   npx vitest run tests/invalid-api-key.test.ts
 */

import { describe, it, expect } from "vitest";
import { scenarioInvalidApiKey } from "./scenarios.js";

describe("Invalid API Key Rejection", () => {
  const baseUrl = process.env.VERIDOQ_API_URL || "http://localhost:3000";

  it("should reject all v1 endpoints with an invalid API key", async () => {
    const result = await scenarioInvalidApiKey(baseUrl);

    expect(result.tested).toBeGreaterThanOrEqual(20);
    expect(result.failures).toEqual([]);
    expect(result.allRejected).toBe(true);
  });
});

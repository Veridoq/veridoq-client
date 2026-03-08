/**
 * API Key Info (/v1/me) — SDK integration test.
 *
 * Verifies the API key returns valid user, org, project, and scopes.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/api-key-info.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioApiKeyInfo, type ApiKeyInfoResult } from "./scenarios.js";

describe("API Key Info (/v1/me)", () => {
  let env: TestEnv;
  let result: ApiKeyInfoResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should return userId, orgId, projectId, and scopes for the API key", async () => {
    result = await scenarioApiKeyInfo(env.client);

    expect(result.userId).toBeTruthy();
    expect(result.orgId).toBeTruthy();
    expect(result.projectId).toBeTruthy();
    expect(result.scopes).toBeInstanceOf(Array);
    expect(result.scopes.length).toBeGreaterThan(0);
  });
});

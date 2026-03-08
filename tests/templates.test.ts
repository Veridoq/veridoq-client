/**
 * Templates — SDK integration test.
 *
 * Verifies the /v1/templates endpoint returns counts for global and shared
 * templates, and lists org templates with id and name.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/templates.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioTemplates, type TemplatesResult } from "./scenarios.js";

describe("Templates", () => {
  let env: TestEnv;
  let result: TemplatesResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should return global/shared counts and org template details", async () => {
    result = await scenarioTemplates(env.client);

    // Global and shared return counts
    expect(result.globalCount).toBeGreaterThanOrEqual(0);
    expect(result.sharedCount).toBeGreaterThanOrEqual(0);

    // Org templates return id and name
    for (const t of result.orgTemplates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
    }
  });
});

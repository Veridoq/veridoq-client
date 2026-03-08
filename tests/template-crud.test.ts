/**
 * Template CRUD — SDK integration test.
 *
 * Tests creating a template, fetching it by ID, and verifying it appears in the list.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/template-crud.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioTemplateCrud, type TemplateCrudResult } from "./scenarios.js";

describe("Template CRUD", () => {
  let env: TestEnv;
  let result: TemplateCrudResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should create a template, fetch it by ID, and find it in the org list", async () => {
    result = await scenarioTemplateCrud(env.client);

    expect(result.createdId).toBeGreaterThan(0);
    expect(result.createdName).toContain("SDK Test Template");
    expect(result.criteriaCount).toBe(3);
    expect(result.fetchedName).toBe(result.createdName);
    expect(result.fetchedCriteriaCount).toBe(3);
  }, 30000);
});

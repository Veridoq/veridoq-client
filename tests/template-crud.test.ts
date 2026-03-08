/**
 * Template CRUD — SDK integration test.
 *
 * Tests deleting existing org templates, creating a new template,
 * fetching it by ID, verifying it in the list, then deleting it.
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

  it("should delete existing templates, create one, verify it, then delete it", async () => {
    result = await scenarioTemplateCrud(env.client);

    expect(result.deletedCount).toBeGreaterThanOrEqual(0);
    expect(result.createdId).toBeGreaterThan(0);
    expect(result.createdName).toContain("SDK Test Template");
    expect(result.criteriaCount).toBe(3);
    expect(result.fetchedName).toBe(result.createdName);
    expect(result.fetchedCriteriaCount).toBe(3);
    expect(result.deleted).toBe(true);
  }, 30000);
});

/**
 * Document Verification — SDK integration test.
 *
 * Mirrors the VerificationTestSuite from the browser test runner.
 * Requires VERIDOQ_TEMPLATE_ID to be set.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx VERIDOQ_TEMPLATE_ID=1 npx vitest run tests/verification.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioVerification, type VerificationResult } from "./scenarios.js";

describe("Document Verification", () => {
  let env: TestEnv;
  let result: VerificationResult;

  beforeAll(async () => {
    env = getTestEnv();
    if (!env.templateId) throw new Error("VERIDOQ_TEMPLATE_ID is required for verification tests");
  });

  it("should upload, verify, and generate media from a document", async () => {
    result = await scenarioVerification(env.client, env.pdfBuffer, env.templateId!);

    expect(result.documentId).toBeTruthy();
    expect(result.jobId).toBeTruthy();
    expect(result.reportId).toBeTruthy();
    expect(result.totalCriteria).toBeGreaterThan(0);
    expect(result.metCount).toBeGreaterThanOrEqual(0);
    expect(result.summary.length).toBeGreaterThan(10);
    expect(result.presentationId).toBeTruthy();
    expect(result.podcastId).toBeTruthy();
  });
});

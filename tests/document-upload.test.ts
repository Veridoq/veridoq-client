/**
 * Document Upload & Processing — SDK integration test.
 *
 * Mirrors the DocumentUploadTestSuite from the browser test runner.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/document-upload.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioDocumentUpload, type DocumentUploadResult } from "./scenarios.js";

describe("Document Upload & Processing", () => {
  let env: TestEnv;
  let result: DocumentUploadResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should upload, process, and generate media from a document", async () => {
    result = await scenarioDocumentUpload(env.client, env.pdfBuffer);

    expect(result.documentId).toBeTruthy();
    expect(result.name).toBe("test-upload.pdf");
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.presentationId).toBeTruthy();
    expect(result.podcastId).toBeTruthy();
  });
});

/**
 * Document Download — SDK integration test.
 *
 * Tests getting a pre-signed download URL for an uploaded document.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/document-download.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioDocumentDownload, type DocumentDownloadResult } from "./scenarios.js";

describe("Document Download", () => {
  let env: TestEnv;
  let result: DocumentDownloadResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should return a valid download URL for an uploaded document", async () => {
    result = await scenarioDocumentDownload(env.client, env.pdfBuffer);

    expect(result.documentId).toBeTruthy();
    expect(result.hasDownloadUrl).toBe(true);
    expect(result.expiresIn).toBeGreaterThan(0);
  }, 300000);
});

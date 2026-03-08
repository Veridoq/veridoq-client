/**
 * Document Chat — SDK integration test.
 *
 * Mirrors the DocChatTestSuite from the browser test runner.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/doc-chat.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioDocChat, type DocChatResult } from "./scenarios.js";

describe("Document Chat", () => {
  let env: TestEnv;
  let result: DocChatResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should chat with a document and maintain session", async () => {
    result = await scenarioDocChat(env.client, env.pdfBuffer);

    expect(result.documentId).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
    expect(result.firstResponse.length).toBeGreaterThan(10);
    expect(result.followUpResponse.length).toBeGreaterThan(10);
    expect(result.sessionMessageCount).toBeGreaterThanOrEqual(2);
  });
});

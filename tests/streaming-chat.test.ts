/**
 * Streaming Document Chat — SDK integration test.
 *
 * Mirrors the StreamingChatTestSuite from the browser test runner.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/streaming-chat.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioStreamingChat, type StreamingChatResult } from "./scenarios.js";

describe("Streaming Document Chat", () => {
  let env: TestEnv;
  let result: StreamingChatResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should stream chat with a document via SSE and maintain session", async () => {
    result = await scenarioStreamingChat(env.client, env.pdfBuffer);

    expect(result.documentId).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
    expect(result.firstResponse.length).toBeGreaterThan(10);
    expect(result.firstChunkCount).toBeGreaterThanOrEqual(1);
    expect(result.followUpResponse.length).toBeGreaterThan(10);
    expect(result.followUpChunkCount).toBeGreaterThanOrEqual(1);
    expect(result.sessionMessageCount).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Chat Session Detail — SDK integration test.
 *
 * Tests getChatSession and getChatSessionMessages after creating a multi-turn conversation.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/chat-session-detail.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioChatSessionDetail, type ChatSessionDetailResult } from "./scenarios.js";

describe("Chat Session Detail", () => {
  let env: TestEnv;
  let result: ChatSessionDetailResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should retrieve full session detail and paginated messages", async () => {
    result = await scenarioChatSessionDetail(env.client, env.pdfBuffer);

    expect(result.documentId).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
    expect(result.messageCount).toBeGreaterThanOrEqual(4);
    expect(result.paginatedMessageCount).toBeGreaterThanOrEqual(4);
    expect(result.firstMessageRole).toBe("user");
  }, 300000);
});

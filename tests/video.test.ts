/**
 * Video Generation — SDK integration test.
 *
 * Tests creating a video from a document, polling until ready, and listing videos.
 *
 * Run:
 *   VERIDOQ_API_KEY=vdq_xxx npx vitest run tests/video.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getTestEnv, type TestEnv } from "./setup.js";
import { scenarioVideo, type VideoResult } from "./scenarios.js";

describe("Video Generation", () => {
  let env: TestEnv;
  let result: VideoResult;

  beforeAll(async () => {
    env = getTestEnv();
  });

  it("should create a video, poll until ready, and verify it in the list", async () => {
    result = await scenarioVideo(env.client, env.pdfBuffer);

    expect(result.documentId).toBeTruthy();
    expect(result.videoId).toBeTruthy();
    expect(result.videoStatus).toBe("ready");
    expect(result.listCount).toBeGreaterThan(0);
  }, 600000);
});

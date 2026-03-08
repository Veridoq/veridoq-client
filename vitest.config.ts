import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 600000, // 10 minutes — some tests generate media
    hookTimeout: 30000,
    env: {
      VERIDOQ_API_URL: process.env.VERIDOQ_API_URL || "http://localhost:3000",
    },
  },
});

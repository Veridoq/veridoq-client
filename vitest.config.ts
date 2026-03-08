import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 600000, // 10 minutes — some tests generate media
    hookTimeout: 30000,
  },
});

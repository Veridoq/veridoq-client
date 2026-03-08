import { defineConfig, loadEnv } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    test: {
      include: ["tests/**/*.test.ts"],
      testTimeout: 600000, // 10 minutes — some tests generate media
      hookTimeout: 30000,
      env: {
        VERIDOQ_API_URL: env.VERIDOQ_API_URL || "http://localhost:3000",
        VERIDOQ_API_KEY: env.VERIDOQ_API_KEY || "",
        VERIDOQ_TEST_PDF: env.VERIDOQ_TEST_PDF || "",
        VERIDOQ_TEMPLATE_ID: env.VERIDOQ_TEMPLATE_ID || "",
      },
    },
  };
});

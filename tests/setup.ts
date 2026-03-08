/**
 * Shared test setup — provides a configured VeridoqClient and test PDF buffer.
 *
 * Required env vars:
 *   VERIDOQ_API_KEY   — A valid API key (vdq_...) scoped to a project
 *
 * Optional:
 *   VERIDOQ_API_URL   — Base URL (default: http://localhost:3000)
 *   VERIDOQ_TEST_PDF  — Path to a PDF file for testing (default: tests/fixtures/nsf-proposal-example.pdf)
 *   VERIDOQ_TEMPLATE_ID — Template ID for verification tests
 */

import { VeridoqClient } from "../src/client.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TestEnv {
  client: VeridoqClient;
  pdfBuffer: Buffer;
  apiKey: string;
  baseUrl: string;
  templateId?: number;
}

export function getTestEnv(): TestEnv {
  const apiKey = process.env.VERIDOQ_API_KEY;
  if (!apiKey) throw new Error("VERIDOQ_API_KEY is required");

  const baseUrl = process.env.VERIDOQ_API_URL || "http://localhost:3000";
  const templateId = process.env.VERIDOQ_TEMPLATE_ID ? Number(process.env.VERIDOQ_TEMPLATE_ID) : undefined;

  const client = new VeridoqClient({
    baseUrl,
    apiKey,
    retry: { maxRetries: 0 },
    timeoutMs: 60000,
  });

  // Resolve test PDF — use env var, or fall back to bundled fixture
  const pdfPath = process.env.VERIDOQ_TEST_PDF || path.resolve(__dirname, "fixtures/nsf-proposal-example.pdf");
  if (!fs.existsSync(pdfPath)) throw new Error(`Test PDF not found at ${pdfPath}`);

  return {
    client,
    pdfBuffer: fs.readFileSync(pdfPath),
    apiKey,
    baseUrl,
    templateId,
  };
}

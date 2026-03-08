/**
 * Workflow helpers: wait for document or job to be ready.
 */

import type { VeridoqClient } from "./client.js";

const DEFAULT_POLL_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 120;

export async function waitForDocumentReady(
  client: VeridoqClient,
  documentId: string,
  options?: { pollIntervalMs?: number; maxAttempts?: number }
): Promise<Record<string, unknown>> {
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  for (let i = 0; i < maxAttempts; i++) {
    const doc = await client.getDocument(documentId);
    const status = (doc.status as string) ?? "";
    if (status === "ready" || status === "complete") return doc as Record<string, unknown>;
    if (status === "failed" || status === "error") {
      throw new Error((doc.statusMessage as string) || "Document processing failed");
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error("Timeout waiting for document to be ready");
}

export async function waitForJobReady(
  client: VeridoqClient,
  jobId: string,
  options?: { pollIntervalMs?: number; maxAttempts?: number }
): Promise<Record<string, unknown>> {
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  for (let i = 0; i < maxAttempts; i++) {
    const job = await client.getJob(jobId);
    const status = (job.status as string) ?? "";
    if (status === "COMPLETE") return job as Record<string, unknown>;
    if (status === "ERROR") {
      throw new Error((job.errorMessage as string) || "Verification job failed");
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error("Timeout waiting for job to complete");
}

export async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

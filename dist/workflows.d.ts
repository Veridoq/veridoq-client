/**
 * Workflow helpers: wait for document or job to be ready.
 */
import type { VeridoqClient } from "./client.js";
export declare function waitForDocumentReady(client: VeridoqClient, documentId: string, options?: {
    pollIntervalMs?: number;
    maxAttempts?: number;
}): Promise<Record<string, unknown>>;
export declare function waitForJobReady(client: VeridoqClient, jobId: string, options?: {
    pollIntervalMs?: number;
    maxAttempts?: number;
}): Promise<Record<string, unknown>>;
export declare function downloadToBuffer(url: string): Promise<Buffer>;
//# sourceMappingURL=workflows.d.ts.map
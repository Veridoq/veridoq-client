/**
 * Workflow helpers: wait for document or job to be ready.
 */
const DEFAULT_POLL_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 120;
export async function waitForDocumentReady(client, documentId, options) {
    const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_MS;
    const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    for (let i = 0; i < maxAttempts; i++) {
        const doc = await client.getDocument(documentId);
        const status = doc.status ?? "";
        if (status === "ready" || status === "complete")
            return doc;
        if (status === "failed" || status === "error") {
            throw new Error(doc.statusMessage || "Document processing failed");
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error("Timeout waiting for document to be ready");
}
export async function waitForJobReady(client, jobId, options) {
    const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_MS;
    const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    for (let i = 0; i < maxAttempts; i++) {
        const job = await client.getJob(jobId);
        const status = job.status ?? "";
        if (status === "COMPLETE")
            return job;
        if (status === "ERROR") {
            throw new Error(job.errorMessage || "Verification job failed");
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error("Timeout waiting for job to complete");
}
export async function downloadToBuffer(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Download failed: ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
}

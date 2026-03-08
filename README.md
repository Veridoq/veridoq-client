# Veridoq Node.js / TypeScript Client

The official SDK for the [Veridoq](https://veridoq.com) document intelligence platform. Veridoq uses AI to verify documents against compliance criteria, extract insights, and generate rich media — all through a simple API.

**What you can do with Veridoq:**

- **Document Verification** — Upload any PDF and verify it against compliance templates with detailed pass/fail criteria, confidence scores, and risk assessments
- **AI Document Chat** — Ask questions about your documents in natural language with multi-turn conversations and streaming responses
- **Custom Templates** — Create reusable verification templates tailored to your industry (regulatory filings, contracts, proposals, audits, etc.)
- **Media Generation** — Automatically generate presentations, podcasts, and videos from your documents
- **Usage Tracking** — Monitor API usage, quotas, and billing in real time

Built with TypeScript, automatic retry with exponential backoff, and full type safety.

## Installation

```bash
npm install veridoq-client
```

Or from the SDK package:

```bash
cd veridoq-client
npm install
```

The SDK ships pre-compiled — no build step needed. To type-check the included tests and examples, run `npx tsc --noEmit`.

## Quick Start

```ts
import { VeridoqClient, waitForDocumentReady, waitForJobReady } from "veridoq-client";
import fs from "fs";

const client = new VeridoqClient({
  baseUrl: "https://api.veridoq.com",
  apiKey: process.env.VERIDOQ_API_KEY!,
});

// Upload a document
const pdfBuffer = fs.readFileSync("document.pdf");
const uploaded = await client.v1UploadDocument({ name: "document.pdf", data: pdfBuffer });
await waitForDocumentReady(client, uploaded.id);

// Verify against a compliance template
const { jobId } = await client.v1CreateReport({ documentId: uploaded.id, templateId: 118 });
const completed = await waitForJobReady(client, jobId);

// Get the verification results
const report = await client.v1GetReport(jobId);
console.log(`${report.report?.metCount}/${report.report?.totalCriteria} criteria met`);
console.log(report.report?.summary);
```

## Authentication

All API requests require an API key prefixed with `vdq_`. Pass it when creating the client:

```ts
const client = new VeridoqClient({
  baseUrl: "https://api.veridoq.com",
  apiKey: "vdq_your_api_key_here",
});
```

API keys are scoped to an organization and project. The key determines which documents, templates, and resources you can access. Manage your keys from the Veridoq dashboard under Settings > API Keys.

## Retry Configuration

The client automatically retries failed requests with exponential backoff and jitter:

```ts
const client = new VeridoqClient({
  baseUrl: "https://api.veridoq.com",
  apiKey: process.env.VERIDOQ_API_KEY!,
  timeoutMs: 60000,
  retry: {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryStatusCodes: [408, 429, 500, 502, 503, 504],
    retryOnNetworkError: true,
  },
});
```

**Defaults:** 3 retries, 1s initial delay, 30s max delay, 2x backoff. Retries on 408, 429, 500, 502, 503, 504 and network errors.

## Error Handling

```ts
import { VeridoqClient, VeridoqError } from "veridoq-client";

try {
  await client.v1CreateReport({ documentId, templateId });
} catch (error) {
  if (error instanceof VeridoqError) {
    console.error(error.message);       // Human-readable message
    console.error(error.statusCode);    // HTTP status (401, 402, 404, etc.)
    console.error(error.code);          // Error code string
    console.error(error.retryable);     // Whether the request can be retried
  }
}
```

### Quota Exceeded (402)

When usage limits are exceeded, the API returns HTTP 402 with usage details and upgrade guidance:

```json
{
  "error": "quota_exceeded",
  "message": "Monthly verification limit reached",
  "feature": "verification",
  "usage": { "current": 200, "limit": 200, "remaining": 0 },
  "upgrade": { "required": true, "suggestedTier": "professional", "upgradeUrl": "/settings/billing" }
}
```

### Rate Limiting (429)

Rate-limited requests return HTTP 429. The client automatically retries these with exponential backoff.

## API Reference

### Documents

```ts
// Upload a document
const uploaded = await client.v1UploadDocument({ name: "report.pdf", data: buffer });

// Wait for processing
const doc = await waitForDocumentReady(client, uploaded.id);

// List documents
const { documents } = await client.v1ListDocuments();

// Get document details
const document = await client.v1GetDocument(documentId);

// Get a pre-signed download URL (expires in 1 hour)
const { downloadUrl, expiresIn } = await client.getDocumentDownloadUrl(documentId);
```

### Templates

The templates endpoint returns **counts** for global and shared templates, and **full details** for your organization's templates.

```ts
// List all templates
const result = await client.v1ListTemplates({ type: "all" });
// result.globalTemplates.count => 42
// result.sharedTemplates.count => 5
// result.orgTemplates => [{ id, name, description, category, criteriaCount, version, createdAt }]

// Filter by type
await client.v1ListTemplates({ type: "global" });  // { globalTemplates: { count } }
await client.v1ListTemplates({ type: "org" });     // { orgTemplates: [...] }
await client.v1ListTemplates({ type: "shared" });  // { sharedTemplates: { count } }

// Get a specific template with full criteria
const template = await client.getTemplate(templateId);

// Create a new template
const created = await client.createTemplate({
  name: "Invoice Compliance",
  description: "Standard invoice verification criteria",
  category: "finance",
  criteria: [
    { text: "Invoice has a valid date" },
    { text: "Total matches sum of line items" },
    { text: "Tax ID is present and valid" },
  ],
});

// Delete a template
await client.deleteTemplate(created.id);
```

### Verification

```ts
// Start a verification job
const { jobId } = await client.v1CreateReport({
  documentId: uploaded.id,
  templateId: 118,              // Use a template...
  // criteria: [{ id: "1", text: "..." }],  // ...or custom criteria
  // redactionSettings: { enabled: true, redactSSN: true },  // Optional PII redaction
});

// Poll for completion
const completed = await waitForJobReady(client, jobId);

// Get the full report
const report = await client.v1GetReport(jobId);
// report.report.summary, metCount, totalCriteria, overallConfidence, overallRisk

// List all reports
const { reports } = await client.v1ListReports();
```

### Document Chat

```ts
// Start a conversation about one or more documents
const response = await client.chat(
  ["doc-uuid-1", "doc-uuid-2"],
  "What are the key findings?"
);
console.log(response.response);
console.log(response.sessionId);

// Follow-up in the same session
const followUp = await client.chat(
  ["doc-uuid-1"],
  "Tell me more about finding #2",
  response.sessionId
);

// Streaming chat (Server-Sent Events)
for await (const event of client.chatStream(["doc-uuid"], "Summarize this")) {
  if (event.event === "chunk") process.stdout.write(event.content);
  if (event.event === "done") console.log("\nDone!");
}

// Retrieve session history
const session = await client.getChatSession(sessionId);
const messages = await client.getChatSessionMessages(sessionId, { page: 1, limit: 50 });
const sessions = await client.listChatSessions();
```

### Media Generation

```ts
// Presentations (PowerPoint)
const pres = await client.createPresentation({ documentId, template: "executive_summary" });
const presStatus = await client.getPresentation(pres.id);
const presList = await client.listPresentations();

// Podcasts (audio)
const pod = await client.createPodcast({ documentId, style: "summary" });
const podStatus = await client.getPodcast(pod.id);
const podList = await client.listPodcasts();

// Videos
const vid = await client.createVideo({ documentId, style: "explainer" });
const vidStatus = await client.getVideo(vid.id);
const vidList = await client.listVideos();
```

### API Key Info & Usage

```ts
// Get info about the current API key
const info = await client.getApiKeyInfo();
// info.scopes, info.organization, info.project

// Get organization usage and billing info
const usage = await client.v1GetUsage();
if (usage.hasSubscription) {
  console.log(`Plan: ${usage.tierDisplayName}`);
  console.log(`Days remaining: ${usage.billingPeriod?.daysRemaining}`);
  for (const f of usage.usage || []) {
    console.log(`${f.feature}: ${f.used}/${f.limit} (${f.percentUsed}%)`);
  }
}
```

## Workflow Helpers

Convenience functions for common polling patterns:

```ts
import { waitForDocumentReady, waitForJobReady, downloadToBuffer } from "veridoq-client";

// Wait for document processing (polls v1GetDocument)
const doc = await waitForDocumentReady(client, documentId, {
  pollIntervalMs: 2000,
  maxAttempts: 120,
});

// Wait for verification job (polls v1GetReport)
const job = await waitForJobReady(client, jobId);

// Download a file from a pre-signed URL to a Buffer
const buffer = await downloadToBuffer(downloadUrl);
```

## Running Tests

The SDK includes a comprehensive integration test suite that exercises every API endpoint. Tests require a valid API key connected to a Veridoq account with an active subscription.

### Setup

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
VERIDOQ_API_URL=https://api.veridoq.com
VERIDOQ_API_KEY=vdq_your_api_key_here
VERIDOQ_TEST_PDF=tests/fixtures/nsf-proposal-example.pdf
VERIDOQ_TEMPLATE_ID=118
```

### Run All Tests

```bash
npm test
```

### Run Individual Test Suites

| Command | What it tests |
|---------|---------------|
| `npm run test:upload` | Document upload, processing, status polling, presentation & podcast generation |
| `npm run test:verify` | Full verification workflow: upload, verify against template, report validation, media generation |
| `npm run test:chat` | Document chat: send messages, follow-up in same session, session listing |
| `npm run test:stream` | Streaming chat via SSE: chunked responses, session persistence |
| `npm run test:templates` | List templates by type (global/shared/org), validate counts and details |
| `npm run test:template-crud` | Full template lifecycle: delete existing, create, fetch, verify in list, delete, confirm removal |
| `npm run test:video` | Video generation: create, poll until ready, list videos |
| `npm run test:chat-detail` | Chat session detail: getChatSession, getChatSessionMessages, message roles |
| `npm run test:download` | Document download: get pre-signed URL, verify accessibility |
| `npm run test:me` | API key info (`/v1/me`): userId, orgId, scopes |
| `npm run test:usage` | Organization usage (`/v1/usage`): subscription, tier, per-feature breakdown |
| `npm run test:invalid-key` | Verifies all 20+ endpoints reject invalid API keys with 401/403 |

### Test Architecture

Tests are structured in two layers:

- **`tests/scenarios.ts`** — Shared scenario logic (assertion + API calls). Used by both Vitest tests and the browser-based test runner in the Veridoq dashboard.
- **`tests/*.test.ts`** — Vitest wrappers that call scenarios and add assertions.

This design means the same test logic runs in CI/CD (via `npm test`) and in the browser (via the admin dashboard test runner).

## Examples

Interactive example scripts are in the `examples/` directory:

```bash
# List templates
VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-templates.ts

# Upload and process documents
VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-documents.ts /path/to/doc.pdf

# Run verification
VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-verification.ts /path/to/doc.pdf [template-id]

# Interactive document chat
VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-chat.ts <document-id>

# Full end-to-end flow
VERIDOQ_API_KEY=vdq_xxx npx tsx examples/test-full-flow.ts /path/to/doc.pdf
```

## Requirements

- Node.js >= 18
- A Veridoq API key (`vdq_...`)

## License

MIT

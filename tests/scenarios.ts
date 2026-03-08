/**
 * Shared SDK test scenarios.
 *
 * These functions contain the core assertion logic for each workflow.
 * They are used by:
 *   - Vitest integration tests (this package)
 *   - Browser-based test runner (src/services/testSuites.ts)
 *
 * Each scenario receives a VeridoqClient and a test PDF buffer,
 * runs the workflow, and returns collected state for further assertions.
 */

import { VeridoqClient, VeridoqError } from "../dist/index.js";
import type { ChatStreamEvent, V1ReportDetail } from "../dist/index.js";

// ── Document Upload & Processing ──────────────────────────────────────────

export interface DocumentUploadResult {
  documentId: string;
  name: string;
  pageCount: number;
  presentationId: string;
  podcastId: string;
}

export async function scenarioDocumentUpload(
  client: VeridoqClient,
  pdfBuffer: Buffer,
  opts?: { pollIntervalMs?: number; mediaPollIntervalMs?: number; mediaMaxAttempts?: number },
): Promise<DocumentUploadResult> {
  const pollInterval = opts?.pollIntervalMs ?? 2000;
  const mediaPollInterval = opts?.mediaPollIntervalMs ?? 10000;
  const mediaMaxAttempts = opts?.mediaMaxAttempts ?? 60;

  // Upload
  const uploaded = await client.v1UploadDocument({ name: "test-upload.pdf", data: pdfBuffer });
  if (!uploaded.id) throw new Error("No document ID returned");

  // Poll until ready
  await pollDocumentReady(client, uploaded.id, { pollIntervalMs: pollInterval });

  // Verify details
  const details = await client.v1GetDocument(uploaded.id);
  if (details.status !== "ready") throw new Error(`Expected ready, got ${details.status}`);
  if (details.name !== "test-upload.pdf") throw new Error(`Expected name test-upload.pdf, got ${details.name}`);
  if (!details.pageCount || details.pageCount < 1) throw new Error("Expected pageCount >= 1");

  // Verify appears in list
  const list = await client.v1ListDocuments();
  const found = (list.documents || []).find((d) => d.id === uploaded.id);
  if (!found) throw new Error(`Document ${uploaded.id} not in list`);

  // Generate presentation
  const pres = await client.createPresentation({ documentId: uploaded.id, template: "executive_summary" });
  if (!pres.id) throw new Error("No presentation ID returned");
  await pollMediaReady(client, "presentation", pres.id, { pollIntervalMs: mediaPollInterval, maxAttempts: mediaMaxAttempts });

  // Generate podcast
  const pod = await client.createPodcast({ documentId: uploaded.id, style: "summary" });
  if (!pod.id) throw new Error("No podcast ID returned");
  await pollMediaReady(client, "podcast", pod.id, { pollIntervalMs: mediaPollInterval, maxAttempts: mediaMaxAttempts });

  return {
    documentId: uploaded.id,
    name: details.name,
    pageCount: details.pageCount!,
    presentationId: pres.id,
    podcastId: pod.id,
  };
}

// ── Verification ──────────────────────────────────────────────────────────

export interface VerificationResult {
  documentId: string;
  jobId: string;
  reportId: string;
  totalCriteria: number;
  metCount: number;
  summary: string;
  presentationId: string;
  podcastId: string;
}

export async function scenarioVerification(
  client: VeridoqClient,
  pdfBuffer: Buffer,
  templateId: number,
  opts?: { pollIntervalMs?: number; mediaPollIntervalMs?: number; mediaMaxAttempts?: number },
): Promise<VerificationResult> {
  const pollInterval = opts?.pollIntervalMs ?? 2000;
  const mediaPollInterval = opts?.mediaPollIntervalMs ?? 10000;
  const mediaMaxAttempts = opts?.mediaMaxAttempts ?? 60;

  // Upload
  const uploaded = await client.v1UploadDocument({ name: "verify-test.pdf", data: pdfBuffer });
  if (!uploaded.id) throw new Error("No document ID returned");

  // Poll document ready
  await pollDocumentReady(client, uploaded.id, { pollIntervalMs: pollInterval });

  // Create report
  const report = await client.v1CreateReport({ documentId: uploaded.id, templateId });
  if (!report.jobId) throw new Error("No jobId returned");

  // Poll verification complete
  const completedJob = await pollJobComplete(client, report.jobId, { pollIntervalMs: pollInterval });
  if (!completedJob.report) throw new Error("Completed job has no report data");
  if (!completedJob.report.totalCriteria || completedJob.report.totalCriteria < 1) throw new Error("Report has no criteria results");
  if (typeof completedJob.report.metCount !== "number") throw new Error("Report missing metCount");
  if (!completedJob.report.summary) throw new Error("Report missing summary");

  // Verify in list
  const listData = await client.v1ListReports();
  const found = (listData.reports || []).find((r) => r.id === report.jobId);
  if (!found) throw new Error(`Report not found in list`);

  // Generate presentation
  const pres = await client.createPresentation({ documentId: uploaded.id });
  if (!pres.id) throw new Error("No presentation ID returned");
  await pollMediaReady(client, "presentation", pres.id, { pollIntervalMs: mediaPollInterval, maxAttempts: mediaMaxAttempts });

  // Generate podcast
  const pod = await client.createPodcast({ documentId: uploaded.id });
  if (!pod.id) throw new Error("No podcast ID returned");
  await pollMediaReady(client, "podcast", pod.id, { pollIntervalMs: mediaPollInterval, maxAttempts: mediaMaxAttempts });

  return {
    documentId: uploaded.id,
    jobId: report.jobId,
    reportId: completedJob.report.id,
    totalCriteria: completedJob.report.totalCriteria,
    metCount: completedJob.report.metCount,
    summary: completedJob.report.summary,
    presentationId: pres.id,
    podcastId: pod.id,
  };
}

// ── Document Chat ─────────────────────────────────────────────────────────

export interface DocChatResult {
  documentId: string;
  sessionId: string;
  firstResponse: string;
  followUpResponse: string;
  sessionMessageCount: number;
}

export async function scenarioDocChat(
  client: VeridoqClient,
  pdfBuffer: Buffer,
  opts?: { pollIntervalMs?: number },
): Promise<DocChatResult> {
  const pollInterval = opts?.pollIntervalMs ?? 2000;

  // Upload + wait
  const uploaded = await client.v1UploadDocument({ name: "chat-test.pdf", data: pdfBuffer });
  if (!uploaded.id) throw new Error("No document ID returned");
  await pollDocumentReady(client, uploaded.id, { pollIntervalMs: pollInterval });

  // First message
  const first = await client.chat([uploaded.id], "What is this document about? Summarize it in 2-3 sentences.");
  if (!first.sessionId) throw new Error("No sessionId returned");
  if (!first.response || first.response.length < 10) throw new Error("Response is empty or too short");

  // Follow-up in same session
  const followUp = await client.chat([uploaded.id], "What are the key findings or conclusions?", first.sessionId);
  if (followUp.sessionId !== first.sessionId) throw new Error("Session ID should persist");
  if (!followUp.response || followUp.response.length < 10) throw new Error("Follow-up response is empty or too short");

  // Verify session in list
  const sessions = await client.listChatSessions();
  const found = (sessions.sessions || []).find((s) => s.id === first.sessionId);
  if (!found) throw new Error(`Session ${first.sessionId} not in list`);
  if ((found.messageCount ?? 0) < 2) throw new Error(`Expected >= 2 messages, got ${found.messageCount}`);

  return {
    documentId: uploaded.id,
    sessionId: first.sessionId,
    firstResponse: first.response,
    followUpResponse: followUp.response,
    sessionMessageCount: found.messageCount,
  };
}

// ── Streaming Chat ────────────────────────────────────────────────────────

export interface StreamingChatResult {
  documentId: string;
  sessionId: string;
  firstResponse: string;
  firstChunkCount: number;
  followUpResponse: string;
  followUpChunkCount: number;
  sessionMessageCount: number;
}

export async function scenarioStreamingChat(
  client: VeridoqClient,
  pdfBuffer: Buffer,
  opts?: { pollIntervalMs?: number; streamTimeoutMs?: number },
): Promise<StreamingChatResult> {
  const pollInterval = opts?.pollIntervalMs ?? 2000;
  const streamTimeout = opts?.streamTimeoutMs ?? 120000;

  // Upload + wait
  const uploaded = await client.v1UploadDocument({ name: "stream-chat-test.pdf", data: pdfBuffer });
  if (!uploaded.id) throw new Error("No document ID returned");
  await pollDocumentReady(client, uploaded.id, { pollIntervalMs: pollInterval });

  // First streaming message
  let sessionId = "";
  let firstResponse = "";
  let firstChunkCount = 0;
  const firstEvents: ChatStreamEvent[] = [];

  for await (const event of client.chatStream([uploaded.id], "What is this document about? Summarize it in 2-3 sentences.", undefined, { timeoutMs: streamTimeout })) {
    firstEvents.push(event);
    if (event.event === "session") sessionId = event.sessionId;
    if (event.event === "chunk") { firstResponse += event.content; firstChunkCount++; }
  }

  if (!sessionId) throw new Error("No sessionId in stream events");
  if (firstChunkCount < 1) throw new Error("No chunks received");
  if (!firstEvents.some((e) => e.event === "done")) throw new Error("No done event");
  if (firstResponse.length < 10) throw new Error(`Response too short (${firstResponse.length} chars)`);

  // Follow-up streaming message
  let followUpResponse = "";
  let followUpChunkCount = 0;

  for await (const event of client.chatStream([uploaded.id], "What are the key findings or conclusions?", sessionId, { timeoutMs: streamTimeout })) {
    if (event.event === "session" && event.sessionId !== sessionId) throw new Error("Session ID mismatch in follow-up");
    if (event.event === "chunk") { followUpResponse += event.content; followUpChunkCount++; }
  }

  if (followUpChunkCount < 1) throw new Error("No chunks in follow-up");
  if (followUpResponse.length < 10) throw new Error("Follow-up response too short");

  // Verify session
  const sessions = await client.listChatSessions();
  const found = (sessions.sessions || []).find((s) => s.id === sessionId);
  if (!found) throw new Error(`Session ${sessionId} not in list`);
  if ((found.messageCount ?? 0) < 2) throw new Error(`Expected >= 2 messages, got ${found.messageCount}`);

  return {
    documentId: uploaded.id,
    sessionId,
    firstResponse,
    firstChunkCount,
    followUpResponse,
    followUpChunkCount,
    sessionMessageCount: found.messageCount,
  };
}

// ── Organization Usage ────────────────────────────────────────────────────

export interface UsageResult {
  hasSubscription: boolean;
  tier?: string;
  tierDisplayName?: string;
  featureCount: number;
  daysRemaining?: number;
}

export async function scenarioUsage(client: VeridoqClient): Promise<UsageResult> {
  const usage = await client.v1GetUsage();

  if (typeof usage.hasSubscription !== "boolean") throw new Error("Missing hasSubscription field");

  if (!usage.hasSubscription) {
    return { hasSubscription: false, featureCount: 0 };
  }

  if (!usage.tier) throw new Error("Usage response missing tier");
  if (!usage.tierDisplayName) throw new Error("Usage response missing tierDisplayName");
  if (!usage.billingPeriod) throw new Error("Usage response missing billingPeriod");
  if (typeof usage.billingPeriod.daysRemaining !== "number") throw new Error("Missing daysRemaining");
  if (!Array.isArray(usage.usage)) throw new Error("Usage response missing usage array");
  if (usage.usage.length === 0) throw new Error("Usage array is empty");

  // Validate each feature entry
  for (const feature of usage.usage) {
    if (!feature.feature) throw new Error("Usage feature missing name");
    if (typeof feature.used !== "number") throw new Error(`Feature ${feature.feature} missing used count`);
    if (typeof feature.limit !== "number") throw new Error(`Feature ${feature.feature} missing limit`);
    if (typeof feature.percentUsed !== "number") throw new Error(`Feature ${feature.feature} missing percentUsed`);
  }

  return {
    hasSubscription: true,
    tier: usage.tier,
    tierDisplayName: usage.tierDisplayName,
    featureCount: usage.usage.length,
    daysRemaining: usage.billingPeriod.daysRemaining,
  };
}

// ── API Key Info (/v1/me) ─────────────────────────────────────────────────

export interface ApiKeyInfoResult {
  userId: string;
  orgId: string;
  projectId: string;
  scopes: string[];
}

export async function scenarioApiKeyInfo(
  client: VeridoqClient,
): Promise<ApiKeyInfoResult> {
  const info = await client.getApiKeyInfo();

  if (!info.userId) throw new Error("Missing userId");
  if (!info.orgId) throw new Error("Missing orgId");
  if (!info.projectId) throw new Error("Missing projectId");
  if (!Array.isArray(info.scopes)) throw new Error("Missing scopes array");
  if (info.scopes.length === 0) throw new Error("scopes array is empty — API key has no scopes");

  return {
    userId: info.userId as string,
    orgId: info.orgId as string,
    projectId: info.projectId as string,
    scopes: info.scopes as string[],
  };
}

// ── Templates ─────────────────────────────────────────────────────────────

export interface TemplatesResult {
  globalCount: number;
  sharedCount: number;
  orgTemplates: Array<{ id: number; name: string; type: string }>;
}

export async function scenarioTemplates(
  client: VeridoqClient,
): Promise<TemplatesResult> {
  // Fetch all templates
  const all = await client.v1ListTemplates({ type: "all" });

  // Global and shared return counts
  if (!all.globalTemplates || typeof all.globalTemplates.count !== "number") {
    throw new Error("Missing globalTemplates.count");
  }
  if (!all.sharedTemplates || typeof all.sharedTemplates.count !== "number") {
    throw new Error("Missing sharedTemplates.count");
  }

  // Org templates return full list with id and name
  if (!Array.isArray(all.orgTemplates)) throw new Error("Missing orgTemplates array");

  for (const t of all.orgTemplates) {
    if (!t.id) throw new Error(`Org template missing id: ${JSON.stringify(t)}`);
    if (!t.name) throw new Error(`Org template ${t.id} missing name`);
  }

  // Verify individual type queries are consistent
  const [globalRes, orgRes, sharedRes] = await Promise.all([
    client.v1ListTemplates({ type: "global" }),
    client.v1ListTemplates({ type: "org" }),
    client.v1ListTemplates({ type: "shared" }),
  ]);

  if (globalRes.globalTemplates?.count !== all.globalTemplates.count) {
    throw new Error(`Global count mismatch: ${globalRes.globalTemplates?.count} vs ${all.globalTemplates.count}`);
  }
  if (sharedRes.sharedTemplates?.count !== all.sharedTemplates.count) {
    throw new Error(`Shared count mismatch: ${sharedRes.sharedTemplates?.count} vs ${all.sharedTemplates.count}`);
  }
  if (orgRes.orgTemplates?.length !== all.orgTemplates.length) {
    throw new Error(`Org count mismatch: ${orgRes.orgTemplates?.length} vs ${all.orgTemplates.length}`);
  }

  return {
    globalCount: all.globalTemplates.count,
    sharedCount: all.sharedTemplates.count,
    orgTemplates: all.orgTemplates.map(t => ({ id: t.id, name: t.name, type: t.type || "org" })),
  };
}

// ── Invalid API Key ───────────────────────────────────────────────────────

export async function scenarioInvalidApiKey(
  baseUrl: string,
): Promise<{ tested: number; allRejected: boolean; failures: string[] }> {
  const badClient = new VeridoqClient({
    baseUrl,
    apiKey: "vdq_invalid_key_00000000000000000000",
    retry: { maxRetries: 0 },
    timeoutMs: 10000,
  });

  const calls: Array<{ label: string; fn: () => Promise<unknown> }> = [
    { label: "v1ListDocuments", fn: () => badClient.v1ListDocuments() },
    { label: "v1GetDocument", fn: () => badClient.v1GetDocument("00000000-0000-0000-0000-000000000000") },
    { label: "v1ListTemplates", fn: () => badClient.v1ListTemplates() },
    { label: "getTemplate", fn: () => badClient.getTemplate(1) },
    { label: "createTemplate", fn: () => badClient.createTemplate({ name: "test", criteria: [] }) },
    { label: "v1CreateReport", fn: () => badClient.v1CreateReport({ documentId: "00000000-0000-0000-0000-000000000000", templateId: 1 }) },
    { label: "v1GetReport", fn: () => badClient.v1GetReport("00000000-0000-0000-0000-000000000000") },
    { label: "v1ListReports", fn: () => badClient.v1ListReports() },
    { label: "createPresentation", fn: () => badClient.createPresentation({ documentId: "00000000-0000-0000-0000-000000000000" }) },
    { label: "getPresentation", fn: () => badClient.getPresentation("00000000-0000-0000-0000-000000000000") },
    { label: "listPresentations", fn: () => badClient.listPresentations() },
    { label: "createPodcast", fn: () => badClient.createPodcast({ documentId: "00000000-0000-0000-0000-000000000000" }) },
    { label: "getPodcast", fn: () => badClient.getPodcast("00000000-0000-0000-0000-000000000000") },
    { label: "listPodcasts", fn: () => badClient.listPodcasts() },
    { label: "createVideo", fn: () => badClient.createVideo({ documentId: "00000000-0000-0000-0000-000000000000" }) },
    { label: "getVideo", fn: () => badClient.getVideo("00000000-0000-0000-0000-000000000000") },
    { label: "listVideos", fn: () => badClient.listVideos() },
    { label: "chat", fn: () => badClient.chat(["00000000-0000-0000-0000-000000000000"], "test") },
    { label: "listChatSessions", fn: () => badClient.listChatSessions() },
    { label: "getApiKeyInfo", fn: () => badClient.getApiKeyInfo() },
    { label: "v1GetUsage", fn: () => badClient.v1GetUsage() },
  ];

  const failures: string[] = [];

  for (const { label, fn } of calls) {
    try {
      await fn();
      failures.push(`${label}: should have thrown but succeeded`);
    } catch (err) {
      if (err instanceof VeridoqError) {
        if (err.statusCode !== 401 && err.statusCode !== 403 && err.statusCode !== 429) {
          failures.push(`${label}: expected 401/403/429, got ${err.statusCode}`);
        }
      } else {
        failures.push(`${label}: unexpected error type: ${err}`);
      }
    }
  }

  return { tested: calls.length, allRejected: failures.length === 0, failures };
}

// ── Template CRUD ─────────────────────────────────────────────────────

export interface TemplateCrudResult {
  createdId: number;
  createdName: string;
  criteriaCount: number;
  fetchedName: string;
  fetchedCriteriaCount: number;
}

export async function scenarioTemplateCrud(
  client: VeridoqClient,
): Promise<TemplateCrudResult> {
  const uniqueName = `SDK Test Template ${Date.now()}`;

  // Create a template
  const created = await client.createTemplate({
    name: uniqueName,
    description: "Auto-generated by SDK integration test",
    category: "test",
    criteria: [
      { text: "Document must contain an executive summary" },
      { text: "All pages must be numbered" },
      { text: "Author name must be clearly identified" },
    ],
  });

  if (!created.id) throw new Error("createTemplate returned no id");
  if (created.name !== uniqueName) throw new Error(`Expected name "${uniqueName}", got "${created.name}"`);
  if (created.criteriaCount !== 3) throw new Error(`Expected 3 criteria, got ${created.criteriaCount}`);

  // Fetch it back by ID
  const fetched = await client.getTemplate(created.id);
  if (!fetched.id) throw new Error("getTemplate returned no id");
  if (fetched.name !== uniqueName) throw new Error(`Fetched name mismatch: ${fetched.name}`);
  if (!fetched.criteria || fetched.criteria.length !== 3) throw new Error(`Expected 3 criteria, got ${fetched.criteria?.length}`);

  // Verify it appears in the org templates list
  const list = await client.v1ListTemplates({ type: "org" });
  const found = (list.orgTemplates || []).find(t => t.id === created.id);
  if (!found) throw new Error(`Created template ${created.id} not found in org templates list`);

  return {
    createdId: created.id,
    createdName: created.name,
    criteriaCount: created.criteriaCount,
    fetchedName: fetched.name,
    fetchedCriteriaCount: fetched.criteria!.length,
  };
}

// ── Video Generation ──────────────────────────────────────────────────

export interface VideoResult {
  documentId: string;
  videoId: string;
  videoStatus: string;
  listCount: number;
}

export async function scenarioVideo(
  client: VeridoqClient,
  pdfBuffer: Buffer,
  opts?: { pollIntervalMs?: number; mediaPollIntervalMs?: number; mediaMaxAttempts?: number },
): Promise<VideoResult> {
  const pollInterval = opts?.pollIntervalMs ?? 2000;
  const mediaPollInterval = opts?.mediaPollIntervalMs ?? 10000;
  const mediaMaxAttempts = opts?.mediaMaxAttempts ?? 60;

  // Upload + wait
  const uploaded = await client.v1UploadDocument({ name: "video-test.pdf", data: pdfBuffer });
  if (!uploaded.id) throw new Error("No document ID returned");
  await pollDocumentReady(client, uploaded.id, { pollIntervalMs: pollInterval });

  // Create video
  const video = await client.createVideo({ documentId: uploaded.id, style: "explainer" });
  if (!video.id) throw new Error("No video ID returned");

  // Poll video ready
  const ready = await pollMediaReady(client, "video", video.id, { pollIntervalMs: mediaPollInterval, maxAttempts: mediaMaxAttempts });

  // Get video details
  const details = await client.getVideo(video.id);
  if (details.status !== "ready") throw new Error(`Expected video ready, got ${details.status}`);

  // List videos
  const list = await client.listVideos();
  const found = ((list as any).videos || []).find((v: any) => v.id === video.id);
  if (!found) throw new Error(`Video ${video.id} not found in list`);

  return {
    documentId: uploaded.id,
    videoId: video.id,
    videoStatus: ready.status,
    listCount: ((list as any).videos || []).length,
  };
}

// ── Chat Session Details ──────────────────────────────────────────────

export interface ChatSessionDetailResult {
  documentId: string;
  sessionId: string;
  sessionTitle: string;
  messageCount: number;
  paginatedMessageCount: number;
  firstMessageRole: string;
}

export async function scenarioChatSessionDetail(
  client: VeridoqClient,
  pdfBuffer: Buffer,
  opts?: { pollIntervalMs?: number },
): Promise<ChatSessionDetailResult> {
  const pollInterval = opts?.pollIntervalMs ?? 2000;

  // Upload + wait
  const uploaded = await client.v1UploadDocument({ name: "chat-detail-test.pdf", data: pdfBuffer });
  if (!uploaded.id) throw new Error("No document ID returned");
  await pollDocumentReady(client, uploaded.id, { pollIntervalMs: pollInterval });

  // Create a chat session with 2 messages
  const first = await client.chat([uploaded.id], "What is the main topic of this document?");
  if (!first.sessionId) throw new Error("No sessionId returned");

  await client.chat([uploaded.id], "List any key dates mentioned.", first.sessionId);

  // Get full session detail
  const session = await client.getChatSession(first.sessionId);
  if (!session.id) throw new Error("getChatSession returned no id");
  if (!session.messages || session.messages.length < 4) {
    // 2 user + 2 assistant = 4 messages minimum
    throw new Error(`Expected >= 4 messages, got ${session.messages?.length}`);
  }

  // Get paginated messages
  const msgs = await client.getChatSessionMessages(first.sessionId, { page: 1, limit: 10 });
  if (!msgs.messages || msgs.messages.length < 4) {
    throw new Error(`Expected >= 4 paginated messages, got ${msgs.messages?.length}`);
  }
  if (!msgs.sessionId) throw new Error("getChatSessionMessages missing sessionId");

  return {
    documentId: uploaded.id,
    sessionId: first.sessionId,
    sessionTitle: session.title || "",
    messageCount: session.messages.length,
    paginatedMessageCount: msgs.messages.length,
    firstMessageRole: session.messages[0]?.role || "unknown",
  };
}

// ── Document Download ─────────────────────────────────────────────────

export interface DocumentDownloadResult {
  documentId: string;
  hasDownloadUrl: boolean;
  expiresIn: number;
}

export async function scenarioDocumentDownload(
  client: VeridoqClient,
  pdfBuffer: Buffer,
  opts?: { pollIntervalMs?: number },
): Promise<DocumentDownloadResult> {
  const pollInterval = opts?.pollIntervalMs ?? 2000;

  // Upload + wait
  const uploaded = await client.v1UploadDocument({ name: "download-test.pdf", data: pdfBuffer });
  if (!uploaded.id) throw new Error("No document ID returned");
  await pollDocumentReady(client, uploaded.id, { pollIntervalMs: pollInterval });

  // Get download URL
  const { downloadUrl, expiresIn } = await client.getDocumentDownloadUrl(uploaded.id);
  if (!downloadUrl) throw new Error("No download URL returned");
  if (typeof expiresIn !== "number" || expiresIn <= 0) throw new Error(`Invalid expiresIn: ${expiresIn}`);

  // Verify URL is accessible (HEAD request)
  const headRes = await fetch(downloadUrl, { method: "HEAD" });
  if (!headRes.ok) throw new Error(`Download URL returned HTTP ${headRes.status}`);

  return {
    documentId: uploaded.id,
    hasDownloadUrl: true,
    expiresIn,
  };
}

// ── Polling Helpers ───────────────────────────────────────────────────────

export async function pollDocumentReady(
  client: VeridoqClient,
  documentId: string,
  opts?: { pollIntervalMs?: number; maxAttempts?: number },
): Promise<{ status: string; [key: string]: unknown }> {
  const maxAttempts = opts?.maxAttempts ?? 150;
  const pollInterval = opts?.pollIntervalMs ?? 2000;
  let lastStatus = "";

  for (let i = 0; i < maxAttempts; i++) {
    const doc = await client.v1GetDocument(documentId);
    lastStatus = (doc.status as string) || "";
    if (lastStatus === "ready") return doc as { status: string; [key: string]: unknown };
    if (lastStatus === "failed") throw new Error("Document processing failed");
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Timeout after ${maxAttempts} polls. Last status: ${lastStatus}`);
}

export async function pollJobComplete(
  client: VeridoqClient,
  jobId: string,
  opts?: { pollIntervalMs?: number; maxAttempts?: number },
): Promise<V1ReportDetail> {
  const maxAttempts = opts?.maxAttempts ?? 150;
  const pollInterval = opts?.pollIntervalMs ?? 2000;
  let lastStatus = "";

  for (let i = 0; i < maxAttempts; i++) {
    const data = await client.v1GetReport(jobId);
    lastStatus = data.status;
    if (lastStatus === "completed") return data;
    if (lastStatus === "failed") throw new Error(`Verification failed: ${data.error || "unknown"}`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Timeout after ${maxAttempts} polls. Last status: ${lastStatus}`);
}

export async function pollMediaReady(
  client: VeridoqClient,
  type: "presentation" | "podcast" | "video",
  id: string,
  opts?: { pollIntervalMs?: number; maxAttempts?: number },
): Promise<{ status: string; [key: string]: unknown }> {
  const maxAttempts = opts?.maxAttempts ?? 60;
  const pollInterval = opts?.pollIntervalMs ?? 10000;
  let lastStatus = "";

  for (let i = 0; i < maxAttempts; i++) {
    const data = type === "presentation"
      ? await client.getPresentation(id)
      : type === "podcast"
      ? await client.getPodcast(id)
      : await client.getVideo(id);
    lastStatus = data.status;
    if (lastStatus === "ready") return data as unknown as { status: string; [key: string]: unknown };
    if (lastStatus === "failed") throw new Error(`${type} generation failed: ${data.error || "unknown"}`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Timeout after ${maxAttempts} polls. Last status: ${lastStatus}`);
}

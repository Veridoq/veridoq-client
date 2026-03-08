/**
 * Veridoq API client with retry support and exponential backoff.
 */

import type {
  ApiError,
  DocumentSummary,
  DocumentDetail,
  TemplatesListResponse,
  JobSummary,
  JobDetail,
  VerifyJobResponse,
  ChatSessionsListResponse,
  ChatSessionDetail,
  ChatMessagesResponse,
  ChatStreamEvent,
  PresentationSummary,
  PresentationCreateRequest,
  PresentationCreateResponse,
  PodcastSummary,
  PodcastCreateRequest,
  PodcastCreateResponse,
  VideoSummary,
  VideoCreateRequest,
  VideoCreateResponse,
  TemplateCreateRequest,
  TemplateCreateResponse,
  ApiKeyInfo,
  TemplateSummary,
  RedactionSettings,
  V1CreateReportRequest,
  V1CreateReportResponse,
  V1ReportDetail,
  V1DocumentUploadResponse,
  V1UsageSummary,
  V1TemplatesResponse,
} from "./types.js";

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryStatusCodes?: number[];
  /** Whether to retry on network errors (default: true) */
  retryOnNetworkError?: boolean;
}

export interface RequestOptions {
  /** Override retry configuration for this request */
  retry?: RetryOptions;
  /** Override request timeout in ms for this request */
  timeoutMs?: number;
  /** Disable retries for this request */
  noRetry?: boolean;
}

export interface VeridoqClientOptions {
  baseUrl: string;
  apiKey: string;
  projectId?: string;
  /** Default retry configuration for all requests */
  retry?: RetryOptions;
  /** Default request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

export class VeridoqError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "VeridoqError";
  }
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
  retryOnNetworkError: true,
};

const DEFAULT_TIMEOUT_MS = 30000;

export class VeridoqClient {
  private baseUrl: string;
  private apiKey: string;
  private projectId?: string;
  private retryOptions: Required<RetryOptions>;
  private timeoutMs: number;

  constructor(options: VeridoqClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.projectId = options.projectId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...options.retry,
    };
    this.validateApiKey();
  }

  /** Get the current default retry options */
  getRetryOptions(): Required<RetryOptions> {
    return { ...this.retryOptions };
  }

  /** Get the current default timeout in ms */
  getTimeoutMs(): number {
    return this.timeoutMs;
  }

  /** Update default retry options */
  setRetryOptions(options: RetryOptions): void {
    this.retryOptions = { ...this.retryOptions, ...options };
  }

  /** Update default timeout in ms */
  setTimeoutMs(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  /** Validate the API key format */
  private validateApiKey(): void {
    if (!this.apiKey.startsWith("vdq_")) {
      console.warn("[VeridoqClient] API key should start with 'vdq_'. Ensure you are using a valid API key.");
    }
  }

  /** Calculate delay for retry attempt using exponential backoff with jitter */
  private calculateDelay(attempt: number, retryOpts: Required<RetryOptions>): number {
    const baseDelay = retryOpts.initialDelayMs * Math.pow(retryOpts.backoffMultiplier, attempt);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, retryOpts.maxDelayMs);
  }

  /** Check if a status code should trigger a retry */
  private shouldRetry(statusCode: number, retryOpts: Required<RetryOptions>): boolean {
    return retryOpts.retryStatusCodes.includes(statusCode);
  }

  /** Sleep for a given number of milliseconds */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      formData?: FormData;
      headers?: Record<string, string>;
      retry?: RetryOptions;
      timeoutMs?: number;
      noRetry?: boolean;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = { ...options?.headers };
    headers["X-API-Key"] = this.apiKey;
    if (this.projectId) headers["X-Project-Id"] = this.projectId;

    let body: BodyInit | undefined;
    if (options?.formData) {
      body = options.formData;
    } else if (options?.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }

    const retryOpts: Required<RetryOptions> = options?.noRetry
      ? { ...this.retryOptions, maxRetries: 0 }
      : { ...this.retryOptions, ...options?.retry };

    const requestTimeout = options?.timeoutMs ?? this.timeoutMs;

    let lastError: Error | undefined;
    let lastStatusCode: number | undefined;

    for (let attempt = 0; attempt <= retryOpts.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

        const res = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const text = await res.text();
        let data: T | ApiError;
        try {
          data = text ? (JSON.parse(text) as T | ApiError) : ({} as T);
        } catch {
          data = { error: "invalid_json", message: text || res.statusText } as ApiError;
        }

        if (!res.ok) {
          lastStatusCode = res.status;
          const err = data as ApiError;
          const errorMessage = err.message || err.error || `HTTP ${res.status}`;

          if (attempt < retryOpts.maxRetries && this.shouldRetry(res.status, retryOpts)) {
            const delay = this.calculateDelay(attempt, retryOpts);
            await this.sleep(delay);
            continue;
          }

          throw new VeridoqError(errorMessage, res.status, err.error, this.shouldRetry(res.status, retryOpts));
        }

        return data as T;
      } catch (error) {
        lastError = error as Error;

        if ((error as Error).name === "AbortError") {
          if (attempt < retryOpts.maxRetries && retryOpts.retryOnNetworkError) {
            const delay = this.calculateDelay(attempt, retryOpts);
            await this.sleep(delay);
            continue;
          }
          throw new VeridoqError("Request timeout", undefined, "TIMEOUT", true);
        }

        if (
          error instanceof TypeError ||
          (error as Error).message?.includes("fetch") ||
          (error as Error).message?.includes("network")
        ) {
          if (attempt < retryOpts.maxRetries && retryOpts.retryOnNetworkError) {
            const delay = this.calculateDelay(attempt, retryOpts);
            await this.sleep(delay);
            continue;
          }
          throw new VeridoqError(
            `Network error: ${(error as Error).message}`,
            undefined,
            "NETWORK_ERROR",
            true
          );
        }

        if (error instanceof VeridoqError) {
          throw error;
        }

        throw new VeridoqError((error as Error).message, lastStatusCode, "UNKNOWN");
      }
    }

    throw lastError || new VeridoqError("Request failed after retries", lastStatusCode);
  }

  private toBlob(file: Buffer | Blob, mimeType?: string): Blob {
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
      return new Blob([new Uint8Array(file)], mimeType ? { type: mimeType } : undefined);
    }
    return file as Blob;
  }

  private inferMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }

  private normalizeDocument(
    document: Buffer | Blob | { name: string; data: Buffer | Blob }
  ): { file: Buffer | Blob; name: string } {
    if (typeof document === "object" && document !== null && "name" in document && "data" in document) {
      const obj = document as { name: string; data: Buffer | Blob };
      return { file: obj.data, name: obj.name };
    }
    return { file: document as Buffer | Blob, name: "document.pdf" };
  }

  async verifyWithTemplate(
    document: Buffer | Blob | { name: string; data: Buffer | Blob },
    templateId: number,
    options?: RequestOptions
  ): Promise<VerifyJobResponse> {
    const form = new FormData();
    const { file, name } = this.normalizeDocument(document);
    form.set("document", this.toBlob(file, this.inferMimeType(name)), name);
    form.set("templateId", String(templateId));
    return this.request<VerifyJobResponse>("POST", "/api/verify", {
      formData: form,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  async verifyExistingDocument(
    documentId: string,
    body: { templateId: number } | { criteria: Array<{ id: string; text: string }> },
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    job: { id: string; status: string; documentId: string; documentName?: string; createdAt: string };
    endpoints?: { status: string; websocket: string };
  }> {
    return this.request("POST", `/verify-existing/${encodeURIComponent(documentId)}`, {
      body,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  async listTemplates(options?: RequestOptions): Promise<TemplatesListResponse> {
    return this.request<TemplatesListResponse>("GET", "/api/templates", {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * List templates via V1 API (API key auth). Returns global, shared, and org templates.
   * @param params - Optional filter: type = "global" | "shared" | "org" | "all" (default "all")
   * @param options - Optional request options
   */
  async v1ListTemplates(
    params?: { type?: "global" | "shared" | "org" | "all" },
    options?: RequestOptions
  ): Promise<V1TemplatesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set("type", params.type);
    const query = searchParams.toString();
    const path = query ? `/v1/templates?${query}` : "/v1/templates";
    return this.request("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  async listJobs(options?: RequestOptions): Promise<JobSummary[]> {
    return this.request<JobSummary[]>("GET", "/jobs", {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  async getJob(jobId: string, options?: RequestOptions): Promise<JobDetail> {
    return this.request<JobDetail>("GET", `/jobs/${encodeURIComponent(jobId)}`, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  async listDocuments(options?: RequestOptions): Promise<DocumentSummary[]> {
    const res = await this.request<{ documents?: DocumentSummary[] }>("GET", "/documents", {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
    return Array.isArray((res as { documents?: DocumentSummary[] }).documents)
      ? (res as { documents: DocumentSummary[] }).documents
      : [];
  }

  async getDocument(documentId: string, options?: RequestOptions): Promise<DocumentDetail> {
    return this.request<DocumentDetail>("GET", `/documents/${encodeURIComponent(documentId)}`, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  async uploadDocument(
    document: Buffer | Blob | { name: string; data: Buffer | Blob },
    options?: RequestOptions
  ): Promise<{ documentId: string; [key: string]: unknown }> {
    const form = new FormData();
    const { file, name } = this.normalizeDocument(document);
    form.set("document", this.toBlob(file, this.inferMimeType(name)), name);
    const res = await this.request<{ documentId?: string; id?: string }>("POST", "/documents", {
      formData: form,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
    const documentId = res.documentId ?? res.id;
    if (!documentId) throw new VeridoqError("Upload response missing documentId", undefined, "INVALID_RESPONSE");
    return { documentId, ...res };
  }

  async getDocumentDownloadUrl(
    documentId: string,
    options?: RequestOptions
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    const res = await this.request<{ downloadUrl?: string; expiresIn?: number }>(
      "GET",
      `/documents/${encodeURIComponent(documentId)}/download`,
      {
        retry: options?.retry,
        timeoutMs: options?.timeoutMs,
        noRetry: options?.noRetry,
      }
    );
    const downloadUrl = res.downloadUrl;
    if (!downloadUrl) throw new VeridoqError("Download URL not returned", undefined, "INVALID_RESPONSE");
    return { downloadUrl, expiresIn: res.expiresIn ?? 900 };
  }

  async getReport(reportId: string, options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", `/reports/${encodeURIComponent(reportId)}`, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  async chat(
    documentIds: string[],
    message: string,
    sessionId?: string,
    options?: RequestOptions
  ): Promise<{ sessionId: string; response: string; documentIds: string[] }> {
    const body: Record<string, unknown> = {
      documentIds,
      message,
    };
    if (sessionId) body.sessionId = sessionId;
    return this.request<{ sessionId: string; response: string; documentIds: string[] }>("POST", "/v1/chat", {
      body,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Stream a chat response via Server-Sent Events (SSE).
   * Yields events: "session" (with sessionId), "chunk" (with content), "done", or "error".
   *
   * @example
   * ```typescript
   * for await (const event of client.chatStream(["doc-123"], "Summarize this document")) {
   *   if (event.event === "chunk") process.stdout.write(event.content);
   *   if (event.event === "done") console.log("\nSession:", event.sessionId);
   * }
   * ```
   */
  async *chatStream(
    documentIds: string[],
    message: string,
    sessionId?: string,
    options?: RequestOptions
  ): AsyncGenerator<ChatStreamEvent> {
    const url = `${this.baseUrl}/v1/chat/stream`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    headers["X-API-Key"] = this.apiKey;
    if (this.projectId) headers["X-Project-Id"] = this.projectId;

    const body: Record<string, unknown> = { documentIds, message };
    if (sessionId) body.sessionId = sessionId;

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs * 4; // longer timeout for streaming
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg: string;
        try { errMsg = JSON.parse(text).error || text; } catch { errMsg = text; }
        throw new VeridoqError(errMsg, res.status);
      }

      if (!res.body) throw new VeridoqError("No response body for stream", undefined, "NO_BODY");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "session") {
                yield { event: "session", sessionId: data.sessionId } as ChatStreamEvent;
              } else if (currentEvent === "chunk") {
                yield { event: "chunk", content: data.content } as ChatStreamEvent;
              } else if (currentEvent === "done") {
                yield { event: "done", sessionId: data.sessionId, documentIds: data.documentIds } as ChatStreamEvent;
              } else if (currentEvent === "error") {
                yield { event: "error", error: data.error, message: data.message } as ChatStreamEvent;
              }
            } catch { /* skip unparseable data lines */ }
            currentEvent = "";
          } else if (line === "") {
            currentEvent = "";
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * List chat sessions for your organization.
   * @param params - Optional pagination and filter parameters
   * @param options - Optional request options
   */
  async listChatSessions(
    params?: { page?: number; limit?: number; documentId?: string },
    options?: RequestOptions
  ): Promise<ChatSessionsListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.documentId) searchParams.set("documentId", params.documentId);
    const query = searchParams.toString();
    const path = query ? `/v1/chat/sessions?${query}` : "/v1/chat/sessions";
    return this.request<ChatSessionsListResponse>("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get a specific chat session with all messages.
   * @param sessionId - The chat session ID
   * @param options - Optional request options
   */
  async getChatSession(sessionId: string, options?: RequestOptions): Promise<ChatSessionDetail> {
    return this.request<ChatSessionDetail>("GET", `/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get messages for a chat session with pagination.
   * @param sessionId - The chat session ID
   * @param params - Optional pagination parameters
   * @param options - Optional request options
   */
  async getChatSessionMessages(
    sessionId: string,
    params?: { page?: number; limit?: number },
    options?: RequestOptions
  ): Promise<ChatMessagesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    const path = query
      ? `/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages?${query}`
      : `/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`;
    return this.request<ChatMessagesResponse>("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }


  // ── Presentations ───────────────────────────────────────────────────────────

  /**
   * Generate a presentation from a document.
   * @param request - Presentation generation parameters
   * @param options - Optional request options
   */
  async createPresentation(
    request: PresentationCreateRequest,
    options?: RequestOptions
  ): Promise<PresentationCreateResponse> {
    return this.request<PresentationCreateResponse>("POST", "/v1/presentations", {
      body: request,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get a presentation by ID (poll until status is "ready" or "failed").
   * @param presentationId - The presentation ID
   * @param options - Optional request options
   */
  async getPresentation(
    presentationId: string,
    options?: RequestOptions
  ): Promise<PresentationSummary> {
    return this.request<PresentationSummary>(
      "GET",
      `/v1/presentations/${encodeURIComponent(presentationId)}`,
      { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry }
    );
  }

  /**
   * List all presentations for your organization.
   * @param params - Optional pagination and filter parameters
   * @param options - Optional request options
   */
  async listPresentations(
    params?: { page?: number; limit?: number; documentId?: string },
    options?: RequestOptions
  ): Promise<{ presentations: PresentationSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.documentId) searchParams.set("documentId", params.documentId);
    const query = searchParams.toString();
    const path = query ? `/v1/presentations?${query}` : "/v1/presentations";
    return this.request("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  // ── Podcasts ────────────────────────────────────────────────────────────────

  /**
   * Generate a podcast from a document.
   * @param request - Podcast generation parameters
   * @param options - Optional request options
   */
  async createPodcast(
    request: PodcastCreateRequest,
    options?: RequestOptions
  ): Promise<PodcastCreateResponse> {
    return this.request<PodcastCreateResponse>("POST", "/v1/podcasts", {
      body: request,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get a podcast by ID (poll until status is "ready" or "failed").
   * @param podcastId - The podcast ID
   * @param options - Optional request options
   */
  async getPodcast(podcastId: string, options?: RequestOptions): Promise<PodcastSummary> {
    return this.request<PodcastSummary>(
      "GET",
      `/v1/podcasts/${encodeURIComponent(podcastId)}`,
      { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry }
    );
  }

  /**
   * List all podcasts for your organization.
   * @param params - Optional pagination and filter parameters
   * @param options - Optional request options
   */
  async listPodcasts(
    params?: { page?: number; limit?: number; documentId?: string },
    options?: RequestOptions
  ): Promise<{ podcasts: PodcastSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.documentId) searchParams.set("documentId", params.documentId);
    const query = searchParams.toString();
    const path = query ? `/v1/podcasts?${query}` : "/v1/podcasts";
    return this.request("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  // ── Videos ──────────────────────────────────────────────────────────────────

  /**
   * Generate a video from a document.
   * @param request - Video generation parameters
   * @param options - Optional request options
   */
  async createVideo(
    request: VideoCreateRequest,
    options?: RequestOptions
  ): Promise<VideoCreateResponse> {
    return this.request<VideoCreateResponse>("POST", "/v1/videos", {
      body: request,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get a video by ID (poll until status is "ready" or "failed").
   * @param videoId - The video ID
   * @param options - Optional request options
   */
  async getVideo(videoId: string, options?: RequestOptions): Promise<VideoSummary> {
    return this.request<VideoSummary>(
      "GET",
      `/v1/videos/${encodeURIComponent(videoId)}`,
      { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry }
    );
  }

  /**
   * List all videos for your organization.
   * @param params - Optional pagination and filter parameters
   * @param options - Optional request options
   */
  async listVideos(
    params?: { page?: number; limit?: number; documentId?: string },
    options?: RequestOptions
  ): Promise<{ videos: VideoSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.documentId) searchParams.set("documentId", params.documentId);
    const query = searchParams.toString();
    const path = query ? `/v1/videos?${query}` : "/v1/videos";
    return this.request("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  /**
   * Create a new criteria template.
   * @param request - Template creation parameters
   * @param options - Optional request options
   */
  async createTemplate(
    request: TemplateCreateRequest,
    options?: RequestOptions
  ): Promise<TemplateCreateResponse> {
    return this.request<TemplateCreateResponse>("POST", "/v1/templates", {
      body: request,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get a template by ID.
   * @param templateId - The template ID
   * @param options - Optional request options
   */
  async getTemplate(
    templateId: number | string,
    options?: RequestOptions
  ): Promise<TemplateSummary & { criteria?: Array<{ id: string; text: string }> }> {
    return this.request(
      "GET",
      `/v1/templates/${encodeURIComponent(String(templateId))}`,
      { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry }
    );
  }

  // ── API Key Info ────────────────────────────────────────────────────────────

  /**
   * Get information about the current API key.
   * @param options - Optional request options
   */
  async getApiKeyInfo(options?: RequestOptions): Promise<ApiKeyInfo> {
    return this.request<ApiKeyInfo>("GET", "/v1/me", {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get organization usage summary for the current billing period.
   * Returns usage counts, limits, and percentages for each feature.
   * @param options - Optional request options
   */
  async v1GetUsage(options?: RequestOptions): Promise<V1UsageSummary> {
    return this.request<V1UsageSummary>("GET", "/v1/usage", {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // V1 API METHODS (API Key authenticated endpoints)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Upload a document via V1 API.
   * @param document - File buffer/blob or object with name and data
   * @param customId - Optional custom document ID (must be unique in your org)
   * @param options - Optional request options
   */
  async v1UploadDocument(
    document: Buffer | Blob | { name: string; data: Buffer | Blob },
    customId?: string,
    options?: RequestOptions
  ): Promise<V1DocumentUploadResponse> {
    const form = new FormData();
    const { file, name } = this.normalizeDocument(document);
    form.set("file", this.toBlob(file, this.inferMimeType(name)), name);
    if (customId) {
      form.set("id", customId);
    }
    return this.request<V1DocumentUploadResponse>("POST", "/v1/documents", {
      formData: form,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * List documents via V1 API.
   * @param params - Optional pagination and filter parameters
   * @param options - Optional request options
   */
  async v1ListDocuments(
    params?: { page?: number; limit?: number; status?: string },
    options?: RequestOptions
  ): Promise<{ documents: DocumentSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString();
    const path = query ? `/v1/documents?${query}` : "/v1/documents";
    return this.request("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get a document by ID via V1 API.
   * @param documentId - The document ID
   * @param options - Optional request options
   */
  async v1GetDocument(documentId: string, options?: RequestOptions): Promise<DocumentDetail> {
    return this.request<DocumentDetail>("GET", `/v1/documents/${encodeURIComponent(documentId)}`, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Create a verification report via V1 API.
   * Supports optional PII redaction settings that override org defaults.
   * 
   * @param request - Report creation parameters including optional redactionSettings
   * @param options - Optional request options
   * 
   * @example
   * ```typescript
   * // Using template with custom redaction settings
   * const result = await client.v1CreateReport({
   *   documentId: "doc-123",
   *   templateId: 42,
   *   mode: "fast",
   *   redactionSettings: {
   *     enabled: true,
   *     redactSSN: true,
   *     redactCreditCard: true,
   *     redactPhone: true,
   *     redactEmail: false,  // Keep emails visible
   *   }
   * });
   * ```
   */
  async v1CreateReport(
    request: V1CreateReportRequest,
    options?: RequestOptions
  ): Promise<V1CreateReportResponse> {
    return this.request<V1CreateReportResponse>("POST", "/v1/reports", {
      body: request,
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get a verification report/job status via V1 API.
   * Poll this endpoint until status is "completed" or "failed".
   * 
   * @param jobId - The job ID returned from v1CreateReport
   * @param options - Optional request options
   */
  async v1GetReport(jobId: string, options?: RequestOptions): Promise<V1ReportDetail> {
    return this.request<V1ReportDetail>("GET", `/v1/reports/${encodeURIComponent(jobId)}`, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * List verification reports via V1 API.
   * @param params - Optional pagination and filter parameters
   * @param options - Optional request options
   */
  async v1ListReports(
    params?: { page?: number; limit?: number; status?: string },
    options?: RequestOptions
  ): Promise<{ reports: V1ReportDetail[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString();
    const path = query ? `/v1/reports?${query}` : "/v1/reports";
    return this.request("GET", path, {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }

  /**
   * Get organization's default redaction settings.
   * @param options - Optional request options
   */
  async getRedactionSettings(options?: RequestOptions): Promise<RedactionSettings & { isDefault?: boolean; updatedAt?: string }> {
    return this.request("GET", "/org/redaction-settings", {
      retry: options?.retry,
      timeoutMs: options?.timeoutMs,
      noRetry: options?.noRetry,
    });
  }
}

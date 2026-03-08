/**
 * Veridoq API client with retry support and exponential backoff.
 */
export class VeridoqError extends Error {
    statusCode;
    code;
    retryable;
    constructor(message, statusCode, code, retryable = false) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.retryable = retryable;
        this.name = "VeridoqError";
    }
}
const DEFAULT_RETRY_OPTIONS = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryStatusCodes: [408, 429, 500, 502, 503, 504],
    retryOnNetworkError: true,
};
const DEFAULT_TIMEOUT_MS = 30000;
export class VeridoqClient {
    baseUrl;
    apiKey;
    projectId;
    retryOptions;
    timeoutMs;
    constructor(options) {
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
    getRetryOptions() {
        return { ...this.retryOptions };
    }
    /** Get the current default timeout in ms */
    getTimeoutMs() {
        return this.timeoutMs;
    }
    /** Update default retry options */
    setRetryOptions(options) {
        this.retryOptions = { ...this.retryOptions, ...options };
    }
    /** Update default timeout in ms */
    setTimeoutMs(timeoutMs) {
        this.timeoutMs = timeoutMs;
    }
    /** Validate the API key format */
    validateApiKey() {
        if (!this.apiKey.startsWith("vdq_")) {
            console.warn("[VeridoqClient] API key should start with 'vdq_'. Ensure you are using a valid API key.");
        }
    }
    /** Calculate delay for retry attempt using exponential backoff with jitter */
    calculateDelay(attempt, retryOpts) {
        const baseDelay = retryOpts.initialDelayMs * Math.pow(retryOpts.backoffMultiplier, attempt);
        const jitter = Math.random() * 0.3 * baseDelay;
        return Math.min(baseDelay + jitter, retryOpts.maxDelayMs);
    }
    /** Check if a status code should trigger a retry */
    shouldRetry(statusCode, retryOpts) {
        return retryOpts.retryStatusCodes.includes(statusCode);
    }
    /** Sleep for a given number of milliseconds */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async request(method, path, options) {
        const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
        const headers = { ...options?.headers };
        headers["X-API-Key"] = this.apiKey;
        if (this.projectId)
            headers["X-Project-Id"] = this.projectId;
        let body;
        if (options?.formData) {
            body = options.formData;
        }
        else if (options?.body !== undefined) {
            body = JSON.stringify(options.body);
            headers["Content-Type"] = "application/json";
        }
        const retryOpts = options?.noRetry
            ? { ...this.retryOptions, maxRetries: 0 }
            : { ...this.retryOptions, ...options?.retry };
        const requestTimeout = options?.timeoutMs ?? this.timeoutMs;
        let lastError;
        let lastStatusCode;
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
                let data;
                try {
                    data = text ? JSON.parse(text) : {};
                }
                catch {
                    data = { error: "invalid_json", message: text || res.statusText };
                }
                if (!res.ok) {
                    lastStatusCode = res.status;
                    const err = data;
                    const errorMessage = err.message || err.error || `HTTP ${res.status}`;
                    if (attempt < retryOpts.maxRetries && this.shouldRetry(res.status, retryOpts)) {
                        const delay = this.calculateDelay(attempt, retryOpts);
                        await this.sleep(delay);
                        continue;
                    }
                    throw new VeridoqError(errorMessage, res.status, err.error, this.shouldRetry(res.status, retryOpts));
                }
                return data;
            }
            catch (error) {
                lastError = error;
                if (error.name === "AbortError") {
                    if (attempt < retryOpts.maxRetries && retryOpts.retryOnNetworkError) {
                        const delay = this.calculateDelay(attempt, retryOpts);
                        await this.sleep(delay);
                        continue;
                    }
                    throw new VeridoqError("Request timeout", undefined, "TIMEOUT", true);
                }
                if (error instanceof TypeError ||
                    error.message?.includes("fetch") ||
                    error.message?.includes("network")) {
                    if (attempt < retryOpts.maxRetries && retryOpts.retryOnNetworkError) {
                        const delay = this.calculateDelay(attempt, retryOpts);
                        await this.sleep(delay);
                        continue;
                    }
                    throw new VeridoqError(`Network error: ${error.message}`, undefined, "NETWORK_ERROR", true);
                }
                if (error instanceof VeridoqError) {
                    throw error;
                }
                throw new VeridoqError(error.message, lastStatusCode, "UNKNOWN");
            }
        }
        throw lastError || new VeridoqError("Request failed after retries", lastStatusCode);
    }
    toBlob(file, mimeType) {
        if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
            return new Blob([new Uint8Array(file)], mimeType ? { type: mimeType } : undefined);
        }
        return file;
    }
    inferMimeType(filename) {
        const ext = filename.split(".").pop()?.toLowerCase();
        const mimeTypes = {
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
    normalizeDocument(document) {
        if (typeof document === "object" && document !== null && "name" in document && "data" in document) {
            const obj = document;
            return { file: obj.data, name: obj.name };
        }
        return { file: document, name: "document.pdf" };
    }
    async verifyWithTemplate(document, templateId, options) {
        const form = new FormData();
        const { file, name } = this.normalizeDocument(document);
        form.set("document", this.toBlob(file, this.inferMimeType(name)), name);
        form.set("templateId", String(templateId));
        return this.request("POST", "/api/verify", {
            formData: form,
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
    async verifyExistingDocument(documentId, body, options) {
        return this.request("POST", `/verify-existing/${encodeURIComponent(documentId)}`, {
            body,
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
    async listTemplates(options) {
        return this.request("GET", "/api/templates", {
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
    async v1ListTemplates(params, options) {
        const searchParams = new URLSearchParams();
        if (params?.type)
            searchParams.set("type", params.type);
        const query = searchParams.toString();
        const path = query ? `/v1/templates?${query}` : "/v1/templates";
        return this.request("GET", path, {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
    async listJobs(options) {
        return this.request("GET", "/jobs", {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
    async getJob(jobId, options) {
        return this.request("GET", `/jobs/${encodeURIComponent(jobId)}`, {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
    async listDocuments(options) {
        const res = await this.request("GET", "/documents", {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
        return Array.isArray(res.documents)
            ? res.documents
            : [];
    }
    async getDocument(documentId, options) {
        return this.request("GET", `/documents/${encodeURIComponent(documentId)}`, {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
    async uploadDocument(document, options) {
        const form = new FormData();
        const { file, name } = this.normalizeDocument(document);
        form.set("document", this.toBlob(file, this.inferMimeType(name)), name);
        const res = await this.request("POST", "/documents", {
            formData: form,
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
        const documentId = res.documentId ?? res.id;
        if (!documentId)
            throw new VeridoqError("Upload response missing documentId", undefined, "INVALID_RESPONSE");
        return { documentId, ...res };
    }
    async getDocumentDownloadUrl(documentId, options) {
        const res = await this.request("GET", `/documents/${encodeURIComponent(documentId)}/download`, {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
        const downloadUrl = res.downloadUrl;
        if (!downloadUrl)
            throw new VeridoqError("Download URL not returned", undefined, "INVALID_RESPONSE");
        return { downloadUrl, expiresIn: res.expiresIn ?? 900 };
    }
    async getReport(reportId, options) {
        return this.request("GET", `/reports/${encodeURIComponent(reportId)}`, {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
    async chat(documentIds, message, sessionId, options) {
        const body = {
            documentIds,
            message,
        };
        if (sessionId)
            body.sessionId = sessionId;
        return this.request("POST", "/v1/chat", {
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
    async *chatStream(documentIds, message, sessionId, options) {
        const url = `${this.baseUrl}/v1/chat/stream`;
        const headers = { "Content-Type": "application/json" };
        headers["X-API-Key"] = this.apiKey;
        if (this.projectId)
            headers["X-Project-Id"] = this.projectId;
        const body = { documentIds, message };
        if (sessionId)
            body.sessionId = sessionId;
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
                let errMsg;
                try {
                    errMsg = JSON.parse(text).error || text;
                }
                catch {
                    errMsg = text;
                }
                throw new VeridoqError(errMsg, res.status);
            }
            if (!res.body)
                throw new VeridoqError("No response body for stream", undefined, "NO_BODY");
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                let currentEvent = "";
                for (const line of lines) {
                    if (line.startsWith("event: ")) {
                        currentEvent = line.slice(7).trim();
                    }
                    else if (line.startsWith("data: ") && currentEvent) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (currentEvent === "session") {
                                yield { event: "session", sessionId: data.sessionId };
                            }
                            else if (currentEvent === "chunk") {
                                yield { event: "chunk", content: data.content };
                            }
                            else if (currentEvent === "done") {
                                yield { event: "done", sessionId: data.sessionId, documentIds: data.documentIds };
                            }
                            else if (currentEvent === "error") {
                                yield { event: "error", error: data.error, message: data.message };
                            }
                        }
                        catch { /* skip unparseable data lines */ }
                        currentEvent = "";
                    }
                    else if (line === "") {
                        currentEvent = "";
                    }
                }
            }
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    /**
     * List chat sessions for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    async listChatSessions(params, options) {
        const searchParams = new URLSearchParams();
        if (params?.page)
            searchParams.set("page", String(params.page));
        if (params?.limit)
            searchParams.set("limit", String(params.limit));
        if (params?.documentId)
            searchParams.set("documentId", params.documentId);
        const query = searchParams.toString();
        const path = query ? `/v1/chat/sessions?${query}` : "/v1/chat/sessions";
        return this.request("GET", path, {
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
    async getChatSession(sessionId, options) {
        return this.request("GET", `/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
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
    async getChatSessionMessages(sessionId, params, options) {
        const searchParams = new URLSearchParams();
        if (params?.page)
            searchParams.set("page", String(params.page));
        if (params?.limit)
            searchParams.set("limit", String(params.limit));
        const query = searchParams.toString();
        const path = query
            ? `/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages?${query}`
            : `/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`;
        return this.request("GET", path, {
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
    async createPresentation(request, options) {
        return this.request("POST", "/v1/presentations", {
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
    async getPresentation(presentationId, options) {
        return this.request("GET", `/v1/presentations/${encodeURIComponent(presentationId)}`, { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry });
    }
    /**
     * List all presentations for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    async listPresentations(params, options) {
        const searchParams = new URLSearchParams();
        if (params?.page)
            searchParams.set("page", String(params.page));
        if (params?.limit)
            searchParams.set("limit", String(params.limit));
        if (params?.documentId)
            searchParams.set("documentId", params.documentId);
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
    async createPodcast(request, options) {
        return this.request("POST", "/v1/podcasts", {
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
    async getPodcast(podcastId, options) {
        return this.request("GET", `/v1/podcasts/${encodeURIComponent(podcastId)}`, { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry });
    }
    /**
     * List all podcasts for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    async listPodcasts(params, options) {
        const searchParams = new URLSearchParams();
        if (params?.page)
            searchParams.set("page", String(params.page));
        if (params?.limit)
            searchParams.set("limit", String(params.limit));
        if (params?.documentId)
            searchParams.set("documentId", params.documentId);
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
    async createVideo(request, options) {
        return this.request("POST", "/v1/videos", {
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
    async getVideo(videoId, options) {
        return this.request("GET", `/v1/videos/${encodeURIComponent(videoId)}`, { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry });
    }
    /**
     * List all videos for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    async listVideos(params, options) {
        const searchParams = new URLSearchParams();
        if (params?.page)
            searchParams.set("page", String(params.page));
        if (params?.limit)
            searchParams.set("limit", String(params.limit));
        if (params?.documentId)
            searchParams.set("documentId", params.documentId);
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
    async createTemplate(request, options) {
        return this.request("POST", "/v1/templates", {
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
    async getTemplate(templateId, options) {
        return this.request("GET", `/v1/templates/${encodeURIComponent(String(templateId))}`, { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry });
    }
    /**
     * Delete an org template by ID.
     * @param templateId - The template ID
     * @param options - Optional request options
     */
    async deleteTemplate(templateId, options) {
        return this.request("DELETE", `/v1/templates/${encodeURIComponent(String(templateId))}`, { retry: options?.retry, timeoutMs: options?.timeoutMs, noRetry: options?.noRetry });
    }
    // ── API Key Info ────────────────────────────────────────────────────────────
    /**
     * Get information about the current API key.
     * @param options - Optional request options
     */
    async getApiKeyInfo(options) {
        return this.request("GET", "/v1/me", {
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
    async v1GetUsage(options) {
        return this.request("GET", "/v1/usage", {
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
    async v1UploadDocument(document, customId, options) {
        const form = new FormData();
        const { file, name } = this.normalizeDocument(document);
        form.set("file", this.toBlob(file, this.inferMimeType(name)), name);
        if (customId) {
            form.set("id", customId);
        }
        return this.request("POST", "/v1/documents", {
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
    async v1ListDocuments(params, options) {
        const searchParams = new URLSearchParams();
        if (params?.page)
            searchParams.set("page", String(params.page));
        if (params?.limit)
            searchParams.set("limit", String(params.limit));
        if (params?.status)
            searchParams.set("status", params.status);
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
    async v1GetDocument(documentId, options) {
        return this.request("GET", `/v1/documents/${encodeURIComponent(documentId)}`, {
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
    async v1CreateReport(request, options) {
        return this.request("POST", "/v1/reports", {
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
    async v1GetReport(jobId, options) {
        return this.request("GET", `/v1/reports/${encodeURIComponent(jobId)}`, {
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
    async v1ListReports(params, options) {
        const searchParams = new URLSearchParams();
        if (params?.page)
            searchParams.set("page", String(params.page));
        if (params?.limit)
            searchParams.set("limit", String(params.limit));
        if (params?.status)
            searchParams.set("status", params.status);
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
    async getRedactionSettings(options) {
        return this.request("GET", "/org/redaction-settings", {
            retry: options?.retry,
            timeoutMs: options?.timeoutMs,
            noRetry: options?.noRetry,
        });
    }
}

/**
 * Veridoq API client with retry support and exponential backoff.
 */
import type { DocumentSummary, DocumentDetail, TemplatesListResponse, JobSummary, JobDetail, VerifyJobResponse, ChatSessionsListResponse, ChatSessionDetail, ChatMessagesResponse, ChatStreamEvent, PresentationSummary, PresentationCreateRequest, PresentationCreateResponse, PodcastSummary, PodcastCreateRequest, PodcastCreateResponse, VideoSummary, VideoCreateRequest, VideoCreateResponse, TemplateCreateRequest, TemplateCreateResponse, ApiKeyInfo, TemplateSummary, RedactionSettings, V1CreateReportRequest, V1CreateReportResponse, V1ReportDetail, V1DocumentUploadResponse, V1UsageSummary, V1TemplatesResponse } from "./types.js";
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
export declare class VeridoqError extends Error {
    readonly statusCode?: number | undefined;
    readonly code?: string | undefined;
    readonly retryable: boolean;
    constructor(message: string, statusCode?: number | undefined, code?: string | undefined, retryable?: boolean);
}
export declare class VeridoqClient {
    private baseUrl;
    private apiKey;
    private projectId?;
    private retryOptions;
    private timeoutMs;
    constructor(options: VeridoqClientOptions);
    /** Get the current default retry options */
    getRetryOptions(): Required<RetryOptions>;
    /** Get the current default timeout in ms */
    getTimeoutMs(): number;
    /** Update default retry options */
    setRetryOptions(options: RetryOptions): void;
    /** Update default timeout in ms */
    setTimeoutMs(timeoutMs: number): void;
    /** Validate the API key format */
    private validateApiKey;
    /** Calculate delay for retry attempt using exponential backoff with jitter */
    private calculateDelay;
    /** Check if a status code should trigger a retry */
    private shouldRetry;
    /** Sleep for a given number of milliseconds */
    private sleep;
    private request;
    private toBlob;
    private inferMimeType;
    private normalizeDocument;
    verifyWithTemplate(document: Buffer | Blob | {
        name: string;
        data: Buffer | Blob;
    }, templateId: number, options?: RequestOptions): Promise<VerifyJobResponse>;
    verifyExistingDocument(documentId: string, body: {
        templateId: number;
    } | {
        criteria: Array<{
            id: string;
            text: string;
        }>;
    }, options?: RequestOptions): Promise<{
        success: boolean;
        job: {
            id: string;
            status: string;
            documentId: string;
            documentName?: string;
            createdAt: string;
        };
        endpoints?: {
            status: string;
            websocket: string;
        };
    }>;
    listTemplates(options?: RequestOptions): Promise<TemplatesListResponse>;
    /**
     * List templates via V1 API (API key auth). Returns global, shared, and org templates.
     * @param params - Optional filter: type = "global" | "shared" | "org" | "all" (default "all")
     * @param options - Optional request options
     */
    v1ListTemplates(params?: {
        type?: "global" | "shared" | "org" | "all";
    }, options?: RequestOptions): Promise<V1TemplatesResponse>;
    listJobs(options?: RequestOptions): Promise<JobSummary[]>;
    getJob(jobId: string, options?: RequestOptions): Promise<JobDetail>;
    listDocuments(options?: RequestOptions): Promise<DocumentSummary[]>;
    getDocument(documentId: string, options?: RequestOptions): Promise<DocumentDetail>;
    uploadDocument(document: Buffer | Blob | {
        name: string;
        data: Buffer | Blob;
    }, options?: RequestOptions): Promise<{
        documentId: string;
        [key: string]: unknown;
    }>;
    getDocumentDownloadUrl(documentId: string, options?: RequestOptions): Promise<{
        downloadUrl: string;
        expiresIn: number;
    }>;
    getReport(reportId: string, options?: RequestOptions): Promise<Record<string, unknown>>;
    chat(documentIds: string[], message: string, sessionId?: string, options?: RequestOptions): Promise<{
        sessionId: string;
        response: string;
        documentIds: string[];
    }>;
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
    chatStream(documentIds: string[], message: string, sessionId?: string, options?: RequestOptions): AsyncGenerator<ChatStreamEvent>;
    /**
     * List chat sessions for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    listChatSessions(params?: {
        page?: number;
        limit?: number;
        documentId?: string;
    }, options?: RequestOptions): Promise<ChatSessionsListResponse>;
    /**
     * Get a specific chat session with all messages.
     * @param sessionId - The chat session ID
     * @param options - Optional request options
     */
    getChatSession(sessionId: string, options?: RequestOptions): Promise<ChatSessionDetail>;
    /**
     * Get messages for a chat session with pagination.
     * @param sessionId - The chat session ID
     * @param params - Optional pagination parameters
     * @param options - Optional request options
     */
    getChatSessionMessages(sessionId: string, params?: {
        page?: number;
        limit?: number;
    }, options?: RequestOptions): Promise<ChatMessagesResponse>;
    /**
     * Generate a presentation from a document.
     * @param request - Presentation generation parameters
     * @param options - Optional request options
     */
    createPresentation(request: PresentationCreateRequest, options?: RequestOptions): Promise<PresentationCreateResponse>;
    /**
     * Get a presentation by ID (poll until status is "ready" or "failed").
     * @param presentationId - The presentation ID
     * @param options - Optional request options
     */
    getPresentation(presentationId: string, options?: RequestOptions): Promise<PresentationSummary>;
    /**
     * List all presentations for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    listPresentations(params?: {
        page?: number;
        limit?: number;
        documentId?: string;
    }, options?: RequestOptions): Promise<{
        presentations: PresentationSummary[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * Generate a podcast from a document.
     * @param request - Podcast generation parameters
     * @param options - Optional request options
     */
    createPodcast(request: PodcastCreateRequest, options?: RequestOptions): Promise<PodcastCreateResponse>;
    /**
     * Get a podcast by ID (poll until status is "ready" or "failed").
     * @param podcastId - The podcast ID
     * @param options - Optional request options
     */
    getPodcast(podcastId: string, options?: RequestOptions): Promise<PodcastSummary>;
    /**
     * List all podcasts for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    listPodcasts(params?: {
        page?: number;
        limit?: number;
        documentId?: string;
    }, options?: RequestOptions): Promise<{
        podcasts: PodcastSummary[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * Generate a video from a document.
     * @param request - Video generation parameters
     * @param options - Optional request options
     */
    createVideo(request: VideoCreateRequest, options?: RequestOptions): Promise<VideoCreateResponse>;
    /**
     * Get a video by ID (poll until status is "ready" or "failed").
     * @param videoId - The video ID
     * @param options - Optional request options
     */
    getVideo(videoId: string, options?: RequestOptions): Promise<VideoSummary>;
    /**
     * List all videos for your organization.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    listVideos(params?: {
        page?: number;
        limit?: number;
        documentId?: string;
    }, options?: RequestOptions): Promise<{
        videos: VideoSummary[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * Create a new criteria template.
     * @param request - Template creation parameters
     * @param options - Optional request options
     */
    createTemplate(request: TemplateCreateRequest, options?: RequestOptions): Promise<TemplateCreateResponse>;
    /**
     * Get a template by ID.
     * @param templateId - The template ID
     * @param options - Optional request options
     */
    getTemplate(templateId: number | string, options?: RequestOptions): Promise<TemplateSummary & {
        criteria?: Array<{
            id: string;
            text: string;
        }>;
    }>;
    /**
     * Get information about the current API key.
     * @param options - Optional request options
     */
    getApiKeyInfo(options?: RequestOptions): Promise<ApiKeyInfo>;
    /**
     * Get organization usage summary for the current billing period.
     * Returns usage counts, limits, and percentages for each feature.
     * @param options - Optional request options
     */
    v1GetUsage(options?: RequestOptions): Promise<V1UsageSummary>;
    /**
     * Upload a document via V1 API.
     * @param document - File buffer/blob or object with name and data
     * @param customId - Optional custom document ID (must be unique in your org)
     * @param options - Optional request options
     */
    v1UploadDocument(document: Buffer | Blob | {
        name: string;
        data: Buffer | Blob;
    }, customId?: string, options?: RequestOptions): Promise<V1DocumentUploadResponse>;
    /**
     * List documents via V1 API.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    v1ListDocuments(params?: {
        page?: number;
        limit?: number;
        status?: string;
    }, options?: RequestOptions): Promise<{
        documents: DocumentSummary[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * Get a document by ID via V1 API.
     * @param documentId - The document ID
     * @param options - Optional request options
     */
    v1GetDocument(documentId: string, options?: RequestOptions): Promise<DocumentDetail>;
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
    v1CreateReport(request: V1CreateReportRequest, options?: RequestOptions): Promise<V1CreateReportResponse>;
    /**
     * Get a verification report/job status via V1 API.
     * Poll this endpoint until status is "completed" or "failed".
     *
     * @param jobId - The job ID returned from v1CreateReport
     * @param options - Optional request options
     */
    v1GetReport(jobId: string, options?: RequestOptions): Promise<V1ReportDetail>;
    /**
     * List verification reports via V1 API.
     * @param params - Optional pagination and filter parameters
     * @param options - Optional request options
     */
    v1ListReports(params?: {
        page?: number;
        limit?: number;
        status?: string;
    }, options?: RequestOptions): Promise<{
        reports: V1ReportDetail[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * Get organization's default redaction settings.
     * @param options - Optional request options
     */
    getRedactionSettings(options?: RequestOptions): Promise<RedactionSettings & {
        isDefault?: boolean;
        updatedAt?: string;
    }>;
}
//# sourceMappingURL=client.d.ts.map
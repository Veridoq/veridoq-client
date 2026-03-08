/**
 * Shared types for Veridoq API responses.
 */
export interface ApiError {
    error: string;
    message?: string;
    [key: string]: unknown;
}
export interface DocumentSummary {
    id: string;
    name: string;
    pageCount?: number;
    chunkCount?: number;
    status?: string;
    statusMessage?: string;
    createdAt?: string;
    [key: string]: unknown;
}
export interface DocumentDetail extends DocumentSummary {
    version?: number;
    s3Key?: string | null;
    [key: string]: unknown;
}
export interface TemplateSummary {
    id: number;
    name: string;
    description?: string | null;
    category?: string | null;
    version: number;
    type?: "global" | "shared" | "org";
    isGlobal?: boolean;
    criteriaCount?: number;
    createdAt?: string;
    [key: string]: unknown;
}
export interface JobSummary {
    id: string;
    documentName: string;
    status: "PROCESSING" | "ERROR" | "COMPLETE";
    internalStatus?: string;
    stage?: string;
    progress?: number;
    progressMessage?: string;
    reportId?: string | null;
    errorMessage?: string | null;
    createdAt?: string;
    startedAt?: string | null;
    completedAt?: string | null;
    duration?: string | null;
    [key: string]: unknown;
}
export interface JobDetail extends JobSummary {
    totalPages?: number | null;
    currentPage?: number | null;
    totalCriteria?: number | null;
    currentCriterion?: number | null;
    results?: {
        reportId: string;
        documentName?: string;
        totalCriteria?: number;
        metCount?: number;
        partiallyMetCount?: number;
        notMetCount?: number;
        insufficientEvidenceCount?: number;
        overallConfidence?: number;
        overallRisk?: string;
        summary?: string | null;
    } | null;
    [key: string]: unknown;
}
export interface VerifyJobResponse {
    success: boolean;
    message: string;
    job: {
        id: string;
        status: string;
        documentName: string;
        createdAt: string;
    };
    template?: {
        id: number;
        name: string;
        version: number;
        criteriaCount: number;
        isGlobal?: boolean;
        category?: string;
    };
    endpoints?: {
        status: string;
        websocket: string;
    };
    [key: string]: unknown;
}
export interface TemplatesListResponse {
    templates: TemplateSummary[];
    count: number;
}
export interface V1TemplatesResponse {
    globalTemplates?: {
        count: number;
    };
    sharedTemplates?: {
        count: number;
    };
    orgTemplates?: TemplateSummary[];
}
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
}
export interface ChatSessionSummary {
    id: string;
    title: string;
    documentIds: string[];
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface ChatSessionDetail {
    id: string;
    title: string;
    documentIds: string[];
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
}
export interface ChatSessionsListResponse {
    sessions: ChatSessionSummary[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface ChatMessagesResponse {
    sessionId: string;
    messages: ChatMessage[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export type MediaStatus = "pending" | "generating" | "ready" | "failed";
export interface PresentationSummary {
    id: string;
    name: string;
    documentId: string;
    template: string;
    status: MediaStatus;
    slideCount?: number;
    depth?: number;
    createdAt: string;
    downloadUrl?: string;
    downloadUrlExpiresIn?: number;
    error?: string;
}
export interface PresentationCreateRequest {
    documentId: string;
    template?: "executive_summary" | "detailed_analysis" | "key_findings" | "compliance_overview";
    name?: string;
    depth?: number;
}
export interface PresentationCreateResponse {
    id: string;
    name: string;
    status: string;
    message: string;
}
export interface PodcastSummary {
    id: string;
    name: string;
    documentId: string;
    style: string;
    status: MediaStatus;
    durationSeconds?: number;
    depth?: number;
    createdAt: string;
    downloadUrl?: string;
    downloadUrlExpiresIn?: number;
    error?: string;
}
export interface PodcastCreateRequest {
    documentId: string;
    style?: "summary" | "deep_dive" | "interview" | "news_brief";
    name?: string;
    depth?: number;
}
export interface PodcastCreateResponse {
    id: string;
    name: string;
    status: string;
    message: string;
}
export interface VideoSummary {
    id: string;
    name: string;
    documentId: string;
    style: string;
    status: MediaStatus;
    durationSeconds?: number;
    depth?: number;
    createdAt: string;
    downloadUrl?: string;
    downloadUrlExpiresIn?: number;
    error?: string;
}
export interface VideoCreateRequest {
    documentId: string;
    style?: "explainer" | "summary" | "highlights" | "presentation";
    name?: string;
    depth?: number;
}
export interface VideoCreateResponse {
    id: string;
    name: string;
    status: string;
    message: string;
}
export interface TemplateCreateRequest {
    name: string;
    description?: string;
    category?: string;
    criteria: Array<{
        text: string;
    }>;
}
export interface TemplateCreateResponse {
    id: number;
    name: string;
    description?: string;
    category?: string;
    criteriaCount: number;
    version: number;
    createdAt: string;
}
export interface ApiKeyInfo {
    keyId: string;
    name: string;
    scopes: string[];
    organization: {
        id: string;
        name: string;
    };
    project?: {
        id: string;
        name: string;
    } | null;
}
export interface ChatResponse {
    sessionId: string;
    response: string;
    documentIds: string[];
}
export type ChatStreamEvent = {
    event: "session";
    sessionId: string;
} | {
    event: "chunk";
    content: string;
} | {
    event: "done";
    sessionId: string;
    documentIds: string[];
} | {
    event: "error";
    error: string;
    message?: string;
};
/** PII redaction settings for document processing */
export interface RedactionSettings {
    /** Enable or disable PII redaction */
    enabled?: boolean;
    /** Redact Social Security Numbers (xxx-xx-xxxx) */
    redactSSN?: boolean;
    /** Redact credit/debit card numbers */
    redactCreditCard?: boolean;
    /** Redact phone numbers */
    redactPhone?: boolean;
    /** Redact email addresses */
    redactEmail?: boolean;
    /** Redact dates of birth */
    redactDOB?: boolean;
    /** Redact bank account numbers */
    redactBankAccount?: boolean;
    /** Redact passport numbers */
    redactPassport?: boolean;
    /** Redact driver's license numbers */
    redactDriverLicense?: boolean;
    /** Redact IP addresses */
    redactIPAddress?: boolean;
}
/** Request to create a verification report via V1 API */
export interface V1CreateReportRequest {
    /** Document ID to verify */
    documentId: string;
    /** Template ID to use for criteria (use this OR criteria) */
    templateId?: number;
    /** Custom criteria (use this OR templateId) */
    criteria?: Array<{
        id: string;
        text: string;
    }>;
    /** Verification mode */
    mode?: "fast";
    /** Override PII redaction settings (defaults to org settings if not provided) */
    redactionSettings?: RedactionSettings;
}
/** Response from creating a verification report */
export interface V1CreateReportResponse {
    jobId: string;
    status: "pending";
    message: string;
}
/** Verification report details */
export interface V1ReportDetail {
    id: string;
    documentName: string;
    status: "pending" | "processing" | "completed" | "failed";
    stage?: string;
    progress?: number;
    progressMessage?: string;
    createdAt: string;
    completedAt?: string;
    error?: string;
    report?: {
        id: string;
        documentId: string;
        summary: string;
        totalCriteria: number;
        metCount: number;
        partiallyMetCount: number;
        notMetCount: number;
        overallConfidence: number;
        overallRisk: "LOW" | "MEDIUM" | "HIGH";
    };
}
/** Document upload response from V1 API */
export interface V1DocumentUploadResponse {
    id: string;
    name: string;
    status: "processing" | "ready" | "failed";
    pageCount?: number;
    message: string;
}
/** Usage feature breakdown */
export interface UsageFeature {
    feature: string;
    used: number;
    /** -1 means unlimited */
    limit: number;
    /** -1 means unlimited */
    remaining: number;
    percentUsed: number;
}
/** Organization usage summary from V1 API */
export interface V1UsageSummary {
    hasSubscription: boolean;
    tier?: string;
    tierDisplayName?: string;
    billingPeriod?: {
        start: string;
        end: string;
        daysRemaining: number;
    };
    usage?: UsageFeature[];
    limits?: Record<string, number>;
    overageRates?: Record<string, number>;
    message?: string;
}
//# sourceMappingURL=types.d.ts.map
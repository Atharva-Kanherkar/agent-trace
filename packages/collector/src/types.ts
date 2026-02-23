import type { EventEnvelope, PrivacyTier } from "../../schema/src/types";

export type HttpMethod = "GET" | "POST";

export interface CollectorHealthResponse {
  readonly status: "ok";
  readonly service: "collector";
  readonly uptimeSec: number;
}

export interface CollectorStats {
  readonly storedEvents: number;
  readonly dedupedEvents: number;
}

export interface CollectorStatsResponse {
  readonly status: "ok";
  readonly stats: CollectorStats;
}

export interface CollectorErrorResponse {
  readonly status: "error";
  readonly message: string;
  readonly errors?: readonly string[];
}

export interface CollectorAcceptResponse {
  readonly status: "accepted";
  readonly accepted: boolean;
  readonly deduped: boolean;
}

export type CollectorPayload =
  | CollectorHealthResponse
  | CollectorStatsResponse
  | CollectorErrorResponse
  | CollectorAcceptResponse;

export interface CollectorRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly body?: unknown;
}

export interface CollectorRawHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly rawBody?: string;
}

export interface CollectorResponse {
  readonly statusCode: number;
  readonly payload: CollectorPayload;
}

export interface CollectorIngestResult {
  readonly accepted: boolean;
  readonly deduped: boolean;
}

export interface CollectorValidationSuccess<TEvent> {
  readonly ok: true;
  readonly value: TEvent;
  readonly errors: readonly [];
}

export interface CollectorValidationFailure {
  readonly ok: false;
  readonly value: undefined;
  readonly errors: readonly string[];
}

export type CollectorValidationResult<TEvent> =
  | CollectorValidationSuccess<TEvent>
  | CollectorValidationFailure;

export interface CollectorEventStore<TEvent> {
  ingest(event: TEvent, eventId: string): CollectorIngestResult;
  getStats(): CollectorStats;
  clear(): void;
}

export interface CollectorHandlerDependencies<TEvent> {
  readonly startedAtMs: number;
  readonly validateEvent: (input: unknown) => CollectorValidationResult<TEvent>;
  readonly getEventId: (event: TEvent) => string;
  readonly store: CollectorEventStore<TEvent>;
  readonly onAcceptedEvent?: (event: TEvent) => void | Promise<void>;
}

export interface CollectorAcceptedEventProcessor<TEvent> {
  processAcceptedEvent(event: TEvent): Promise<void>;
}

export interface CollectorProcessingStats {
  readonly acceptedEvents: number;
  readonly processingFailures: number;
  readonly lastProcessingFailure?: string;
}

export interface TranscriptEventPayload extends Readonly<Record<string, unknown>> {}

export interface TranscriptParseInput {
  readonly filePath: string;
  readonly privacyTier: PrivacyTier;
  readonly sessionIdFallback?: string;
  readonly ingestedAt?: string;
}

export interface TranscriptParseSuccess {
  readonly ok: true;
  readonly filePath: string;
  readonly parsedEvents: readonly EventEnvelope<TranscriptEventPayload>[];
  readonly skippedLines: number;
  readonly errors: readonly [];
}

export interface TranscriptParseFailure {
  readonly ok: false;
  readonly filePath: string;
  readonly parsedEvents: readonly EventEnvelope<TranscriptEventPayload>[];
  readonly skippedLines: number;
  readonly errors: readonly string[];
}

export type TranscriptParseResult = TranscriptParseSuccess | TranscriptParseFailure;

export interface TranscriptIngestionSink {
  ingestTranscriptEvents(events: readonly EventEnvelope<TranscriptEventPayload>[]): Promise<void>;
}

export interface TranscriptIngestionProcessorOptions {
  readonly sink: TranscriptIngestionSink;
  readonly onParseErrors?: (errors: readonly string[]) => void;
}

export interface OtelNormalizeInput {
  readonly payload: unknown;
  readonly privacyTier: PrivacyTier;
  readonly ingestedAt?: string;
}

export interface OtelNormalizeSuccess {
  readonly ok: true;
  readonly events: readonly EventEnvelope<TranscriptEventPayload>[];
  readonly droppedRecords: number;
  readonly errors: readonly [];
}

export interface OtelNormalizeFailure {
  readonly ok: false;
  readonly events: readonly EventEnvelope<TranscriptEventPayload>[];
  readonly droppedRecords: number;
  readonly errors: readonly string[];
}

export type OtelNormalizeResult = OtelNormalizeSuccess | OtelNormalizeFailure;

export interface OtelEventsSink {
  ingestOtelEvents(events: readonly EventEnvelope<TranscriptEventPayload>[]): Promise<void>;
}

export interface OtelExportProcessDependencies {
  readonly privacyTier: PrivacyTier;
  readonly onNormalizationErrors?: (errors: readonly string[]) => void;
  readonly sink?: OtelEventsSink;
}

export interface OtelExportProcessResult {
  readonly normalizedEvents: number;
  readonly droppedRecords: number;
  readonly normalizationFailed: boolean;
  readonly sinkFailed: boolean;
  readonly errors: readonly string[];
}

export interface OtelGrpcReceiverOptions {
  readonly address?: string;
  readonly privacyTier?: PrivacyTier;
  readonly onNormalizationErrors?: (errors: readonly string[]) => void;
  readonly sink?: OtelEventsSink;
}

export interface OtelGrpcReceiverStats {
  readonly exportCalls: number;
  readonly normalizedEvents: number;
  readonly droppedRecords: number;
  readonly normalizationFailures: number;
  readonly sinkFailures: number;
}

export interface OtelGrpcReceiverHandle {
  readonly address: string;
  getStats(): OtelGrpcReceiverStats;
  close(): Promise<void>;
}

export type CollectorEnvelopePayload = Readonly<Record<string, unknown>>;
export type CollectorEnvelopeEvent = EventEnvelope<CollectorEnvelopePayload>;

export interface EnvelopeCollectorServiceOptions {
  readonly startedAtMs?: number;
  readonly onAcceptedEvent?: (event: CollectorEnvelopeEvent) => void | Promise<void>;
  readonly processor?: CollectorAcceptedEventProcessor<CollectorEnvelopeEvent>;
  readonly enableTranscriptIngestion?: boolean;
}

export interface EnvelopeCollectorService {
  readonly dependencies: CollectorHandlerDependencies<CollectorEnvelopeEvent>;
  readonly store: CollectorEventStore<CollectorEnvelopeEvent>;
  handleRaw(request: CollectorRawHttpRequest): CollectorResponse;
  getProcessingStats(): CollectorProcessingStats;
  ingestEvents(events: readonly CollectorEnvelopeEvent[]): Promise<void>;
  readonly otelSink: OtelEventsSink;
  readonly transcriptSink: TranscriptIngestionSink;
}

export interface StandaloneCollectorStartOptions extends EnvelopeCollectorServiceOptions {
  readonly host?: string;
  readonly httpPort?: number;
  readonly otelGrpcAddress?: string;
  readonly privacyTier?: PrivacyTier;
}

export interface StandaloneCollectorHandle {
  readonly httpAddress: string;
  readonly otelGrpcAddress: string;
  readonly service: EnvelopeCollectorService;
  readonly otelReceiver: OtelGrpcReceiverHandle;
  close(): Promise<void>;
}

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

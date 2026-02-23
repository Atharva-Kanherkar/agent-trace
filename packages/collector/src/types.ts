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
}


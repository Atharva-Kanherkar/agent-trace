import type { ApiRawHttpRequest, ApiResponse } from "../../api/src/types";
import type { CollectorRawHttpRequest, CollectorResponse } from "../../collector/src/types";
import type {
  ClickHouseAgentEventRow,
  ClickHouseSessionTraceRow,
  ClickHouseConnectionOptions,
  ClickHouseInsertClient,
  ClickHouseQueryClient,
  PostgresConnectionOptions,
  PostgresCommitRow,
  PostgresSessionPersistenceClient,
  PostgresSessionRow
} from "../../platform/src/persistence-types";
import type { AgentSessionTrace, EventEnvelope } from "../../schema/src/types";

export interface RuntimeEnvelopePayload extends Readonly<Record<string, unknown>> {}

export type RuntimeEnvelope = EventEnvelope<RuntimeEnvelopePayload>;

export interface RuntimeRequestHandlers {
  handleCollectorRaw(request: CollectorRawHttpRequest): CollectorResponse;
  handleApiRaw(request: ApiRawHttpRequest): Promise<ApiResponse>;
}

export interface RuntimeStartOptions {
  readonly host?: string;
  readonly collectorPort?: number;
  readonly apiPort?: number;
  readonly otelGrpcAddress?: string;
  readonly enableCollectorServer?: boolean;
  readonly enableApiServer?: boolean;
  readonly enableOtelReceiver?: boolean;
  readonly otelPrivacyTier?: 1 | 2 | 3;
}

export interface RuntimeStartedServers {
  readonly collectorAddress?: string;
  readonly apiAddress?: string;
  readonly otelGrpcAddress?: string;
  close(): Promise<void>;
}

export interface RuntimePersistenceSnapshot {
  readonly clickHouseRows: readonly ClickHouseAgentEventRow[];
  readonly clickHouseSessionTraceRows: readonly ClickHouseSessionTraceRow[];
  readonly postgresSessionRows: readonly PostgresSessionRow[];
  readonly postgresCommitRows: readonly PostgresCommitRow[];
  readonly writeFailures: readonly string[];
}

export interface RuntimePersistence {
  persistAcceptedEvent(event: RuntimeEnvelope, trace: AgentSessionTrace): Promise<void>;
  getSnapshot(): RuntimePersistenceSnapshot;
}

export interface RuntimePersistenceClients {
  readonly clickHouseClient: ClickHouseInsertClient<ClickHouseAgentEventRow>;
  readonly clickHouseSessionTraceClient?: ClickHouseInsertClient<ClickHouseSessionTraceRow>;
  readonly postgresSessionClient: PostgresSessionPersistenceClient;
}

export interface InMemoryRuntimeOptions {
  readonly startedAtMs?: number;
  readonly persistence?: RuntimePersistence;
  readonly dailyCostReader?: RuntimeDailyCostReader;
}

export interface RuntimeDailyCostReader {
  listDailyCosts(limit?: number): Promise<readonly { date: string; totalCostUsd: number; sessionCount: number; promptCount: number; toolCallCount: number }[]>;
}

export interface RuntimeClosableClickHouseClient
  extends ClickHouseInsertClient<ClickHouseAgentEventRow>, ClickHouseQueryClient
{
  close(): Promise<void>;
}

export interface RuntimeClosablePostgresClient extends PostgresSessionPersistenceClient {
  close(): Promise<void>;
  listCommitsBySessionId?(sessionId: string): Promise<readonly { sha: string; session_id: string; prompt_id: string | null; message: string | null; committed_at: string | null }[]>;
}

export interface RuntimeDatabaseClientFactories {
  createClickHouseClient(options: ClickHouseConnectionOptions): RuntimeClosableClickHouseClient;
  createPostgresClient(options: PostgresConnectionOptions): RuntimeClosablePostgresClient;
}

export interface RuntimeDatabaseConfig {
  readonly clickHouse: ClickHouseConnectionOptions;
  readonly postgres: PostgresConnectionOptions;
}

export interface DatabaseBackedRuntimeOptions {
  readonly startedAtMs?: number;
  readonly clickHouse: ClickHouseConnectionOptions;
  readonly postgres: PostgresConnectionOptions;
  readonly factories?: RuntimeDatabaseClientFactories;
  readonly hydrateFromClickHouse?: boolean;
  readonly bootstrapSessionTraceLimit?: number;
  readonly sessionTraceSyncIntervalMs?: number;
  readonly sessionTimelineEventLimit?: number;
}

export interface DatabaseBackedRuntime<TRuntime = unknown> {
  readonly runtime: TRuntime;
  readonly hydratedSessionTraces: Promise<number>;
  close(): Promise<void>;
}

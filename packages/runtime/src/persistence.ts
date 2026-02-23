import { ClickHouseEventWriter } from "../../platform/src/clickhouse-event-writer";
import { PostgresSessionWriter } from "../../platform/src/postgres-writer";
import type { AgentSessionTrace } from "../../schema/src/types";
import type {
  ClickHouseAgentEventRow,
  ClickHouseInsertClient,
  ClickHouseInsertRequest,
  PostgresCommitRow,
  PostgresSessionPersistenceClient,
  PostgresSessionRow
} from "../../platform/src/persistence-types";
import type {
  RuntimeEnvelope,
  RuntimePersistence,
  RuntimePersistenceClients,
  RuntimePersistenceSnapshot
} from "./types";

class InMemoryRuntimeClickHouseClient implements ClickHouseInsertClient<ClickHouseAgentEventRow> {
  private readonly rows: ClickHouseAgentEventRow[] = [];

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    request.rows.forEach((row) => {
      this.rows.push(row);
    });
  }

  public listRows(): readonly ClickHouseAgentEventRow[] {
    return this.rows;
  }
}

class InMemoryRuntimePostgresClient implements PostgresSessionPersistenceClient {
  private readonly sessionsById = new Map<string, PostgresSessionRow>();
  private readonly commitsBySha = new Map<string, PostgresCommitRow>();

  public async upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void> {
    rows.forEach((row) => {
      this.sessionsById.set(row.session_id, row);
    });
  }

  public async upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void> {
    rows.forEach((row) => {
      this.commitsBySha.set(row.sha, row);
    });
  }

  public listSessions(): readonly PostgresSessionRow[] {
    return [...this.sessionsById.values()];
  }

  public listCommits(): readonly PostgresCommitRow[] {
    return [...this.commitsBySha.values()];
  }
}

class WriterBackedRuntimePersistence implements RuntimePersistence {
  private readonly clickHouseWriter: ClickHouseEventWriter;
  private readonly postgresSessionWriter: PostgresSessionWriter;
  private readonly writeFailures: string[];

  public constructor(clickHouseWriter: ClickHouseEventWriter, postgresSessionWriter: PostgresSessionWriter) {
    this.clickHouseWriter = clickHouseWriter;
    this.postgresSessionWriter = postgresSessionWriter;
    this.writeFailures = [];
  }

  public async persistAcceptedEvent(event: RuntimeEnvelope, trace: AgentSessionTrace): Promise<void> {
    const clickHouseWrite = this.clickHouseWriter.writeEvent(event).catch((error: unknown) => {
      this.writeFailures.push(`clickhouse: ${String(error)}`);
    });
    const postgresWrite = this.postgresSessionWriter.writeTrace(trace).catch((error: unknown) => {
      this.writeFailures.push(`postgres: ${String(error)}`);
    });

    await Promise.all([clickHouseWrite, postgresWrite]);
  }

  public getSnapshot(): RuntimePersistenceSnapshot {
    return {
      clickHouseRows: [],
      postgresSessionRows: [],
      postgresCommitRows: [],
      writeFailures: this.writeFailures
    };
  }
}

export class InMemoryRuntimePersistence extends WriterBackedRuntimePersistence {
  private readonly clickHouseClient: InMemoryRuntimeClickHouseClient;
  private readonly postgresClient: InMemoryRuntimePostgresClient;

  public constructor() {
    const clickHouseClient = new InMemoryRuntimeClickHouseClient();
    const postgresClient = new InMemoryRuntimePostgresClient();
    super(new ClickHouseEventWriter(clickHouseClient), new PostgresSessionWriter(postgresClient));
    this.clickHouseClient = clickHouseClient;
    this.postgresClient = postgresClient;
  }

  public override getSnapshot(): RuntimePersistenceSnapshot {
    const base = super.getSnapshot();
    return {
      ...base,
      clickHouseRows: this.clickHouseClient.listRows(),
      postgresSessionRows: this.postgresClient.listSessions(),
      postgresCommitRows: this.postgresClient.listCommits()
    };
  }
}

export function createWriterBackedRuntimePersistence(clients: RuntimePersistenceClients): RuntimePersistence {
  const clickHouseWriter = new ClickHouseEventWriter(clients.clickHouseClient);
  const postgresSessionWriter = new PostgresSessionWriter(clients.postgresSessionClient);
  return new WriterBackedRuntimePersistence(clickHouseWriter, postgresSessionWriter);
}

import assert from "node:assert/strict";
import test from "node:test";

import type { AgentSessionTrace } from "../../schema/src/types";
import type {
  ClickHouseAgentEventRow,
  ClickHouseInsertClient,
  ClickHouseInsertRequest,
  PostgresCommitRow,
  PostgresSessionPersistenceClient,
  PostgresSessionRow
} from "../../platform/src/persistence-types";
import { createWriterBackedRuntimePersistence } from "../src/persistence";
import { createInMemoryRuntime } from "../src/runtime";
import { createRuntimeEnvelope } from "../src/samples";
import type { RuntimePersistence } from "../src/types";

class FakeClickHouseInsertClient implements ClickHouseInsertClient<ClickHouseAgentEventRow> {
  public readonly requests: ClickHouseInsertRequest<ClickHouseAgentEventRow>[] = [];

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    this.requests.push(request);
  }
}

class FakePostgresSessionClient implements PostgresSessionPersistenceClient {
  public readonly sessionsRequests: Array<readonly PostgresSessionRow[]> = [];
  public readonly commitsRequests: Array<readonly PostgresCommitRow[]> = [];

  public async upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void> {
    this.sessionsRequests.push(rows);
  }

  public async upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void> {
    this.commitsRequests.push(rows);
  }
}

class RecordingPersistence implements RuntimePersistence {
  public readonly events: string[] = [];

  public async persistAcceptedEvent(
    event: ReturnType<typeof createRuntimeEnvelope>,
    _trace: AgentSessionTrace
  ): Promise<void> {
    this.events.push(event.eventId);
  }

  public getSnapshot() {
    return {
      clickHouseRows: [],
      postgresSessionRows: [],
      postgresCommitRows: [],
      writeFailures: []
    } as const;
  }
}

test("createWriterBackedRuntimePersistence writes through provided clients", async () => {
  const clickHouseClient = new FakeClickHouseInsertClient();
  const postgresClient = new FakePostgresSessionClient();
  const persistence = createWriterBackedRuntimePersistence({
    clickHouseClient,
    postgresSessionClient: postgresClient
  });

  const runtime = createInMemoryRuntime({
    startedAtMs: Date.parse("2026-02-23T10:00:00.000Z"),
    persistence
  });
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_writer_backed",
    eventId: "evt_writer_backed",
    eventType: "tool_result",
    payload: {
      user_id: "user_writer_backed",
      commit_sha: "sha_writer_backed"
    }
  });

  const response = runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(envelope)
  });
  assert.equal(response.statusCode, 202);

  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });

  assert.equal(clickHouseClient.requests.length, 1);
  assert.equal(clickHouseClient.requests[0]?.rows[0]?.event_id, "evt_writer_backed");
  assert.equal(postgresClient.sessionsRequests.length, 1);
  assert.equal(postgresClient.commitsRequests.length, 1);
});

test("createInMemoryRuntime uses injected persistence implementation", async () => {
  const persistence = new RecordingPersistence();
  const runtime = createInMemoryRuntime({
    persistence,
    startedAtMs: Date.parse("2026-02-23T10:00:00.000Z")
  });
  const envelope = createRuntimeEnvelope({
    sessionId: "sess_custom_persistence",
    eventId: "evt_custom_persistence"
  });

  runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(envelope)
  });

  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });

  assert.deepEqual(persistence.events, ["evt_custom_persistence"]);
});

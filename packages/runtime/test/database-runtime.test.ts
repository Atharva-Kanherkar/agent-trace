import assert from "node:assert/strict";
import test from "node:test";

import type {
  ClickHouseAgentEventRow,
  ClickHouseInsertRequest,
  PostgresCommitRow,
  PostgresPullRequestRow,
  PostgresSessionRow
} from "../../platform/src/persistence-types";
import { createRuntimeEnvelope } from "../src/samples";
import { createDatabaseBackedRuntime } from "../src/database-runtime";
import type {
  RuntimeClosableClickHouseClient,
  RuntimeClosablePostgresClient
} from "../src/types";

class FakeClosableClickHouseClient implements RuntimeClosableClickHouseClient {
  public readonly requests: ClickHouseInsertRequest<ClickHouseAgentEventRow>[] = [];
  public readonly queries: string[] = [];
  public readonly queryRows: unknown[] = [];
  public closeCalled = false;

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    this.requests.push(request);
  }

  public async queryJsonEachRow<TRow>(query: string): Promise<readonly TRow[]> {
    this.queries.push(query);
    return this.queryRows as readonly TRow[];
  }

  public async close(): Promise<void> {
    this.closeCalled = true;
  }
}

class FakeClosablePostgresClient implements RuntimeClosablePostgresClient {
  public readonly sessionsRequests: Array<readonly PostgresSessionRow[]> = [];
  public readonly commitsRequests: Array<readonly PostgresCommitRow[]> = [];
  public closeCalled = false;

  public async upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void> {
    this.sessionsRequests.push(rows);
  }

  public async upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void> {
    this.commitsRequests.push(rows);
  }

  public async upsertPullRequests(_rows: readonly PostgresPullRequestRow[]): Promise<void> {}

  public async close(): Promise<void> {
    this.closeCalled = true;
  }
}

test("createDatabaseBackedRuntime wires persistence through injected db clients", async () => {
  const clickHouseClient = new FakeClosableClickHouseClient();
  const postgresClient = new FakeClosablePostgresClient();

  const wrapped = createDatabaseBackedRuntime({
    startedAtMs: Date.parse("2026-02-23T10:00:00.000Z"),
    clickHouse: {
      url: "http://127.0.0.1:8123"
    },
    postgres: {
      connectionString: "postgres://localhost:5432/agent_trace"
    },
    factories: {
      createClickHouseClient: () => clickHouseClient,
      createPostgresClient: () => postgresClient
    }
  });
  const hydratedRows = await wrapped.hydratedSessionTraces;
  assert.equal(hydratedRows, 0);
  assert.equal(clickHouseClient.queries.length, 1);

  const response = wrapped.runtime.handleCollectorRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(
      createRuntimeEnvelope({
        sessionId: "sess_db_runtime",
        eventId: "evt_db_runtime",
        eventType: "tool_result",
        payload: {
          user_id: "user_db_runtime",
          commit_sha: "sha_db_runtime"
        }
      })
    )
  });
  assert.equal(response.statusCode, 202);

  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });

  assert.equal(clickHouseClient.requests.length, 2);
  assert.equal(clickHouseClient.requests[0]?.table, "agent_events");
  assert.equal(clickHouseClient.requests[1]?.table, "session_traces");
  assert.equal(postgresClient.sessionsRequests.length, 1);
  assert.equal(postgresClient.commitsRequests.length, 1);

  await wrapped.close();
  assert.equal(clickHouseClient.closeCalled, true);
  assert.equal(postgresClient.closeCalled, true);
});

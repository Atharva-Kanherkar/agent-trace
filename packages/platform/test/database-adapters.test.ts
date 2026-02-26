import assert from "node:assert/strict";
import test from "node:test";

import { ClickHouseSdkInsertClient, PostgresPgPersistenceClient } from "../src/database-adapters";
import type {
  ClickHouseAgentEventRow,
  PostgresPoolClient,
  PostgresQueryValues,
  PostgresSessionRow,
  PostgresCommitRow,
  PostgresInstanceSettingRow,
  PostgresTransactionalClient
} from "../src/persistence-types";

interface RecordedQuery {
  readonly sql: string;
  readonly values?: PostgresQueryValues;
}

class FakeClickHouseDriver {
  public readonly insertRequests: unknown[] = [];
  public readonly queryRequests: unknown[] = [];
  public queryResultRows: unknown[] = [];
  public closeCalled = false;

  public async insert(request: unknown): Promise<void> {
    this.insertRequests.push(request);
  }

  public async query(request: unknown): Promise<{
    json<T>(): Promise<T>;
  }> {
    this.queryRequests.push(request);
    return {
      json: async <T>(): Promise<T> => this.queryResultRows as T
    };
  }

  public async close(): Promise<void> {
    this.closeCalled = true;
  }
}

class FakePostgresTransactionalClient implements PostgresTransactionalClient {
  public readonly queries: RecordedQuery[] = [];
  public releaseCalled = false;
  public failOnSqlIncludes?: string;

  public async query(sql: string, values?: PostgresQueryValues): Promise<unknown> {
    this.queries.push({ sql, ...(values !== undefined ? { values } : {}) });
    if (this.failOnSqlIncludes !== undefined && sql.includes(this.failOnSqlIncludes)) {
      throw new Error(`forced failure for sql match: ${this.failOnSqlIncludes}`);
    }

    return {};
  }

  public release(): void {
    this.releaseCalled = true;
  }
}

class FakePostgresPool implements PostgresPoolClient {
  public readonly clients: FakePostgresTransactionalClient[] = [];
  public endCalled = false;

  public async connect(): Promise<PostgresTransactionalClient> {
    const client = new FakePostgresTransactionalClient();
    this.clients.push(client);
    return client;
  }

  public async end(): Promise<void> {
    this.endCalled = true;
  }
}

function createClickHouseRow(overrides: Partial<ClickHouseAgentEventRow> = {}): ClickHouseAgentEventRow {
  return {
    event_id: "evt_001",
    event_type: "tool_result",
    event_timestamp: "2026-02-23T10:00:00.000Z",
    session_id: "sess_001",
    prompt_id: "prompt_001",
    user_id: "user_001",
    source: "hook",
    agent_type: "claude_code",
    tool_name: "Read",
    tool_success: 1,
    tool_duration_ms: 100,
    model: "claude-sonnet-4",
    cost_usd: 0.01,
    input_tokens: 100,
    output_tokens: 20,
    cache_read_tokens: null,
    cache_write_tokens: null,
    api_duration_ms: 800,
    lines_added: 2,
    lines_removed: 1,
    files_changed: ["README.md"],
    commit_sha: "sha_001",
    attributes: {
      source_version: "smoke"
    },
    ...overrides
  };
}

test("ClickHouseSdkInsertClient maps insert request to JSONEachRow format", async () => {
  const driver = new FakeClickHouseDriver();
  const client = new ClickHouseSdkInsertClient(
    driver as unknown as ConstructorParameters<typeof ClickHouseSdkInsertClient>[0]
  );

  await client.insertJsonEachRow({
    table: "agent_events",
    rows: [createClickHouseRow()]
  });

  assert.equal(driver.insertRequests.length, 1);
  const request = driver.insertRequests[0] as {
    readonly table?: string;
    readonly format?: string;
    readonly values?: readonly ClickHouseAgentEventRow[];
  };
  assert.equal(request.table, "agent_events");
  assert.equal(request.format, "JSONEachRow");
  assert.equal(request.values?.length, 1);

  await client.close();
  assert.equal(driver.closeCalled, true);
});

test("ClickHouseSdkInsertClient skips insert call when no rows are provided", async () => {
  const driver = new FakeClickHouseDriver();
  const client = new ClickHouseSdkInsertClient(
    driver as unknown as ConstructorParameters<typeof ClickHouseSdkInsertClient>[0]
  );

  await client.insertJsonEachRow({
    table: "agent_events",
    rows: []
  });

  assert.equal(driver.insertRequests.length, 0);
});

test("ClickHouseSdkInsertClient maps query request to JSONEachRow format", async () => {
  const driver = new FakeClickHouseDriver();
  driver.queryResultRows = [
    {
      session_id: "sess_query_001"
    }
  ];
  const client = new ClickHouseSdkInsertClient(
    driver as unknown as ConstructorParameters<typeof ClickHouseSdkInsertClient>[0]
  );

  const rows = await client.queryJsonEachRow<{ readonly session_id: string }>("SELECT session_id FROM session_traces");

  assert.equal(driver.queryRequests.length, 1);
  const request = driver.queryRequests[0] as {
    readonly query?: string;
    readonly format?: string;
  };
  assert.equal(request.query, "SELECT session_id FROM session_traces");
  assert.equal(request.format, "JSONEachRow");
  assert.deepEqual(rows, [{ session_id: "sess_query_001" }]);
});

test("PostgresPgPersistenceClient performs transactional upserts for sessions, commits, and settings", async () => {
  const pool = new FakePostgresPool();
  const client = new PostgresPgPersistenceClient(pool);

  const sessions: readonly PostgresSessionRow[] = [
    {
      session_id: "sess_001",
      user_id: "user_same",
      started_at: "2026-02-23T10:00:00.000Z",
      ended_at: null,
      status: "active",
      project_path: "/repo",
      git_repo: "Atharva-Kanherkar/agent-trace",
      git_branch: "main"
    },
    {
      session_id: "sess_002",
      user_id: "user_same",
      started_at: "2026-02-23T11:00:00.000Z",
      ended_at: "2026-02-23T11:10:00.000Z",
      status: "completed",
      project_path: "/repo",
      git_repo: "Atharva-Kanherkar/agent-trace",
      git_branch: "main"
    }
  ];
  const commits: readonly PostgresCommitRow[] = [
    {
      sha: "sha_001",
      session_id: "sess_001",
      prompt_id: "prompt_001",
      message: "feat: add sql adapter",
      lines_added: 12,
      lines_removed: 2,
      chain_cost_usd: 0.25,
      committed_at: "2026-02-23T10:09:00.000Z"
    }
  ];
  const settings: readonly PostgresInstanceSettingRow[] = [
    {
      key: "privacy_tier",
      value: 1
    }
  ];

  await client.upsertSessions(sessions);
  await client.upsertCommits(commits);
  await client.upsertInstanceSettings(settings);
  await client.close();

  assert.equal(pool.endCalled, true);
  assert.equal(pool.clients.length, 3);
  pool.clients.forEach((transactionClient) => {
    assert.equal(transactionClient.releaseCalled, true);
    assert.equal(transactionClient.queries[0]?.sql, "BEGIN");
    assert.equal(transactionClient.queries.at(-1)?.sql, "COMMIT");
  });

  const sessionTx = pool.clients[0];
  assert.notEqual(sessionTx, undefined);
  if (sessionTx !== undefined) {
    const userInsertCount = sessionTx.queries.filter((entry) => entry.sql.includes("INSERT INTO users")).length;
    const sessionUpsertCount = sessionTx.queries.filter((entry) => entry.sql.includes("INSERT INTO sessions")).length;
    assert.equal(userInsertCount, 1);
    assert.equal(sessionUpsertCount, 2);
  }

  const settingsTx = pool.clients[2];
  assert.notEqual(settingsTx, undefined);
  if (settingsTx !== undefined) {
    const settingQuery = settingsTx.queries.find((entry) => entry.sql.includes("INSERT INTO instance_settings"));
    assert.notEqual(settingQuery, undefined);
    assert.equal(settingQuery?.values?.[1], "1");
  }
});

test("PostgresPgPersistenceClient rolls back transaction on query failure", async () => {
  const pool = new FakePostgresPool();
  const client = new PostgresPgPersistenceClient(pool);

  const connectClient = await pool.connect();
  const failing = connectClient as FakePostgresTransactionalClient;
  failing.failOnSqlIncludes = "INSERT INTO sessions";
  // Reuse the configured client for this single test execution.
  pool.clients.length = 0;
  pool.clients.push(failing);
  pool.connect = async (): Promise<PostgresTransactionalClient> => failing;

  await assert.rejects(
    async () => {
      await client.upsertSessions([
        {
          session_id: "sess_fail",
          user_id: "user_fail",
          started_at: "2026-02-23T10:00:00.000Z",
          ended_at: null,
          status: "active",
          project_path: null,
          git_repo: null,
          git_branch: null
        }
      ]);
    },
    /forced failure/
  );

  assert.equal(failing.releaseCalled, true);
  assert.equal(failing.queries.some((entry) => entry.sql === "ROLLBACK"), true);
});

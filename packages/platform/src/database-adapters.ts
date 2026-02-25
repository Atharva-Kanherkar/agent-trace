import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { Pool, type PoolConfig } from "pg";

import type {
  ClickHouseAgentEventRow,
  ClickHouseConnectionOptions,
  ClickHouseInsertClient,
  ClickHouseInsertRequest,
  ClickHouseQueryClient,
  PostgresCommitReadRow,
  PostgresCommitReader,
  PostgresConnectionOptions,
  PostgresInstanceSettingRow,
  PostgresPoolClient,
  PostgresSessionPersistenceClient,
  PostgresSessionRow,
  PostgresSettingsPersistenceClient,
  PostgresTransactionalClient,
  PostgresCommitRow
} from "./persistence-types";

const INSERT_USER_SQL = "INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING";
const UPSERT_SESSION_SQL = `
INSERT INTO sessions
  (session_id, user_id, started_at, ended_at, status, project_path, git_repo, git_branch)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (session_id)
DO UPDATE SET
  user_id = EXCLUDED.user_id,
  started_at = EXCLUDED.started_at,
  ended_at = EXCLUDED.ended_at,
  status = EXCLUDED.status,
  project_path = EXCLUDED.project_path,
  git_repo = EXCLUDED.git_repo,
  git_branch = EXCLUDED.git_branch,
  updated_at = NOW()
`;

const UPSERT_COMMIT_SQL = `
INSERT INTO commits
  (sha, session_id, prompt_id, message, lines_added, lines_removed, chain_cost_usd, committed_at)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (sha)
DO UPDATE SET
  session_id = EXCLUDED.session_id,
  prompt_id = EXCLUDED.prompt_id,
  message = EXCLUDED.message,
  lines_added = EXCLUDED.lines_added,
  lines_removed = EXCLUDED.lines_removed,
  chain_cost_usd = EXCLUDED.chain_cost_usd,
  committed_at = EXCLUDED.committed_at
`;

const UPSERT_INSTANCE_SETTING_SQL = `
INSERT INTO instance_settings
  (key, value)
VALUES
  ($1, $2::jsonb)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW()
`;

type ClickHouseInsertDriver = Pick<ClickHouseClient, "insert" | "query" | "close">;

function toClickHouseInsertRequest(
  request: ClickHouseInsertRequest<ClickHouseAgentEventRow>
): Parameters<ClickHouseClient["insert"]>[0] {
  return {
    table: request.table,
    values: request.rows,
    format: "JSONEachRow"
  };
}

async function runInTransaction(
  pool: PostgresPoolClient,
  operation: (client: PostgresTransactionalClient) => Promise<void>
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await operation(client);
    await client.query("COMMIT");
  } catch (error: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Best effort rollback. Original failure is still propagated.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class ClickHouseSdkInsertClient
  implements ClickHouseInsertClient<ClickHouseAgentEventRow>, ClickHouseQueryClient
{
  private readonly driver: ClickHouseInsertDriver;

  public constructor(driver: ClickHouseInsertDriver) {
    this.driver = driver;
  }

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    if (request.rows.length === 0) {
      return;
    }

    await this.driver.insert(toClickHouseInsertRequest(request));
  }

  public async queryJsonEachRow<TRow>(query: string): Promise<readonly TRow[]> {
    const resultSet = await this.driver.query({
      query,
      format: "JSONEachRow"
    });
    const rows = await resultSet.json<TRow>();
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows;
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }
}

const SELECT_COMMITS_BY_SESSION_SQL = `
SELECT sha, session_id, prompt_id, message, lines_added, lines_removed, committed_at
FROM commits
WHERE session_id = $1
ORDER BY committed_at ASC NULLS LAST
`;

export class PostgresPgPersistenceClient
  implements PostgresSessionPersistenceClient, PostgresSettingsPersistenceClient, PostgresCommitReader
{
  private readonly pool: PostgresPoolClient;

  public constructor(pool: PostgresPoolClient) {
    this.pool = pool;
  }

  public async upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const uniqueUserIds = [...new Set(rows.map((row) => row.user_id))];
    await runInTransaction(this.pool, async (client) => {
      for (const userId of uniqueUserIds) {
        await client.query(INSERT_USER_SQL, [userId]);
      }

      for (const row of rows) {
        await client.query(UPSERT_SESSION_SQL, [
          row.session_id,
          row.user_id,
          row.started_at,
          row.ended_at,
          row.status,
          row.project_path,
          row.git_repo,
          row.git_branch
        ]);
      }
    });
  }

  public async upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    await runInTransaction(this.pool, async (client) => {
      for (const row of rows) {
        await client.query(UPSERT_COMMIT_SQL, [
          row.sha,
          row.session_id,
          row.prompt_id,
          row.message,
          row.lines_added,
          row.lines_removed,
          row.chain_cost_usd,
          row.committed_at
        ]);
      }
    });
  }

  public async listCommitsBySessionId(sessionId: string): Promise<readonly PostgresCommitReadRow[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(SELECT_COMMITS_BY_SESSION_SQL, [sessionId]) as { rows?: readonly PostgresCommitReadRow[] };
      if (result.rows === undefined || !Array.isArray(result.rows)) {
        return [];
      }
      return result.rows;
    } finally {
      client.release();
    }
  }

  public async upsertInstanceSettings(rows: readonly PostgresInstanceSettingRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    await runInTransaction(this.pool, async (client) => {
      for (const row of rows) {
        await client.query(UPSERT_INSTANCE_SETTING_SQL, [row.key, JSON.stringify(row.value)]);
      }
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createClickHouseSdkInsertClient(options: ClickHouseConnectionOptions): ClickHouseSdkInsertClient {
  const clientOptions: {
    url: string;
    username?: string;
    password?: string;
    database?: string;
  } = {
    url: options.url
  };
  if (options.username !== undefined) {
    clientOptions.username = options.username;
  }
  if (options.password !== undefined) {
    clientOptions.password = options.password;
  }
  if (options.database !== undefined) {
    clientOptions.database = options.database;
  }

  const client = createClient(clientOptions);
  return new ClickHouseSdkInsertClient(client);
}

export function createPostgresPgPersistenceClient(
  options: PostgresConnectionOptions = {}
): PostgresPgPersistenceClient {
  const poolConfig: PoolConfig = {};
  if (options.connectionString !== undefined) {
    poolConfig.connectionString = options.connectionString;
  }
  if (options.host !== undefined) {
    poolConfig.host = options.host;
  }
  if (options.port !== undefined) {
    poolConfig.port = options.port;
  }
  if (options.user !== undefined) {
    poolConfig.user = options.user;
  }
  if (options.password !== undefined) {
    poolConfig.password = options.password;
  }
  if (options.database !== undefined) {
    poolConfig.database = options.database;
  }
  if (options.maxPoolSize !== undefined) {
    poolConfig.max = options.maxPoolSize;
  }
  if (options.ssl === true) {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
  }

  const pool = new Pool(poolConfig);
  return new PostgresPgPersistenceClient(pool);
}

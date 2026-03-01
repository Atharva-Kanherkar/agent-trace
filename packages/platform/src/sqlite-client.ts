import Database from "better-sqlite3";

import type {
  ClickHouseAgentEventRow,
  ClickHouseAgentEventReadRow,
  ClickHouseInsertClient,
  ClickHouseInsertRequest,
  ClickHouseQueryClient,
  ClickHouseSessionTraceRow,
  PostgresCommitReadRow,
  PostgresCommitRow,
  PostgresPullRequestRow,
  PostgresSessionPersistenceClient,
  PostgresSessionRow
} from "./persistence-types";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_events (
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_timestamp TEXT NOT NULL,
  session_id TEXT NOT NULL,
  prompt_id TEXT,
  user_id TEXT NOT NULL DEFAULT 'unknown_user',
  source TEXT NOT NULL DEFAULT 'hook',
  agent_type TEXT NOT NULL DEFAULT 'claude_code',
  tool_name TEXT,
  tool_success INTEGER,
  tool_duration_ms REAL,
  model TEXT,
  cost_usd REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  api_duration_ms REAL,
  lines_added INTEGER,
  lines_removed INTEGER,
  files_changed TEXT NOT NULL DEFAULT '[]',
  commit_sha TEXT,
  attributes TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_session ON agent_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON agent_events(event_timestamp);

CREATE TABLE IF NOT EXISTS session_traces (
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  user_id TEXT NOT NULL DEFAULT 'unknown_user',
  git_repo TEXT,
  git_branch TEXT,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  api_call_count INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  total_cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0,
  models_used TEXT NOT NULL DEFAULT '[]',
  tools_used TEXT NOT NULL DEFAULT '[]',
  files_touched TEXT NOT NULL DEFAULT '[]',
  commit_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  project_path TEXT,
  git_repo TEXT,
  git_branch TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commits (
  sha TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt_id TEXT,
  message TEXT,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0,
  chain_cost_usd REAL NOT NULL DEFAULT 0,
  committed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_commits_session ON commits(session_id);

CREATE TABLE IF NOT EXISTS pull_requests (
  session_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  url TEXT,
  merged_at TEXT,
  PRIMARY KEY (session_id, repo, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_session ON pull_requests(session_id);

CREATE TABLE IF NOT EXISTS instance_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function toJsonArray(value: readonly string[]): string {
  return JSON.stringify(value);
}

function fromJsonArray(value: unknown): readonly string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function fromJsonObject(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

export class SqliteClient
  implements
    ClickHouseInsertClient<ClickHouseAgentEventRow>,
    ClickHouseQueryClient,
    PostgresSessionPersistenceClient
{
  private readonly db: Database.Database;

  public constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.migrateCacheTokenColumns();
    this.migrateDeduplicateEvents();
    this.db.exec(SCHEMA_SQL);
    this.migrateRebuildBrokenTraces();
    this.migrateTeamColumns();
  }

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    if (request.rows.length === 0) return;

    if (request.table === "agent_events" || request.table === undefined) {
      this.insertEvents(request.rows);
    }
  }

  public insertSessionTraces(rows: readonly ClickHouseSessionTraceRow[]): void {
    if (rows.length === 0) return;

    const upsert = this.db.prepare(`
      INSERT INTO session_traces
        (session_id, version, started_at, ended_at, user_id, user_email, user_display_name, git_repo, git_branch,
         prompt_count, tool_call_count, api_call_count, total_cost_usd,
         total_input_tokens, total_output_tokens, total_cache_read_tokens, total_cache_write_tokens,
         lines_added, lines_removed,
         models_used, tools_used, files_touched, commit_count, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        version = excluded.version,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        user_id = excluded.user_id,
        user_email = COALESCE(excluded.user_email, session_traces.user_email),
        user_display_name = COALESCE(excluded.user_display_name, session_traces.user_display_name),
        git_repo = excluded.git_repo,
        git_branch = excluded.git_branch,
        prompt_count = excluded.prompt_count,
        tool_call_count = excluded.tool_call_count,
        api_call_count = excluded.api_call_count,
        total_cost_usd = excluded.total_cost_usd,
        total_input_tokens = excluded.total_input_tokens,
        total_output_tokens = excluded.total_output_tokens,
        total_cache_read_tokens = excluded.total_cache_read_tokens,
        total_cache_write_tokens = excluded.total_cache_write_tokens,
        lines_added = excluded.lines_added,
        lines_removed = excluded.lines_removed,
        models_used = excluded.models_used,
        tools_used = excluded.tools_used,
        files_touched = excluded.files_touched,
        commit_count = excluded.commit_count,
        updated_at = excluded.updated_at
    `);

    const transaction = this.db.transaction((traceRows: readonly ClickHouseSessionTraceRow[]) => {
      for (const row of traceRows) {
        upsert.run(
          row.session_id,
          row.version,
          row.started_at,
          row.ended_at,
          row.user_id,
          row.user_email ?? null,
          row.user_display_name ?? null,
          row.git_repo,
          row.git_branch,
          row.prompt_count,
          row.tool_call_count,
          row.api_call_count,
          row.total_cost_usd,
          row.total_input_tokens,
          row.total_output_tokens,
          row.total_cache_read_tokens,
          row.total_cache_write_tokens,
          row.lines_added,
          row.lines_removed,
          toJsonArray(row.models_used as string[]),
          toJsonArray(row.tools_used as string[]),
          toJsonArray(row.files_touched as string[]),
          row.commit_count,
          row.updated_at
        );
      }
    });
    transaction(rows);
  }

  public async queryJsonEachRow<TRow>(query: string): Promise<readonly TRow[]> {
    const sqliteQuery = this.translateQuery(query);
    const rawRows = this.db.prepare(sqliteQuery).all() as Record<string, unknown>[];
    return rawRows.map((raw) => this.normalizeRow<TRow>(raw, query));
  }

  public async upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void> {
    if (rows.length === 0) return;

    const insertUser = this.db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)");
    const upsertSession = this.db.prepare(`
      INSERT INTO sessions
        (session_id, user_id, started_at, ended_at, status, project_path, git_repo, git_branch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        user_id = excluded.user_id,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        status = excluded.status,
        project_path = excluded.project_path,
        git_repo = excluded.git_repo,
        git_branch = excluded.git_branch,
        updated_at = datetime('now')
    `);

    const transaction = this.db.transaction((sessionRows: readonly PostgresSessionRow[]) => {
      const userIds = new Set(sessionRows.map((r) => r.user_id));
      for (const userId of userIds) {
        insertUser.run(userId);
      }
      for (const row of sessionRows) {
        upsertSession.run(
          row.session_id, row.user_id, row.started_at, row.ended_at,
          row.status, row.project_path, row.git_repo, row.git_branch
        );
      }
    });
    transaction(rows);
  }

  public async upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void> {
    if (rows.length === 0) return;

    const upsert = this.db.prepare(`
      INSERT INTO commits
        (sha, session_id, prompt_id, message, lines_added, lines_removed, chain_cost_usd, committed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sha) DO UPDATE SET
        session_id = excluded.session_id,
        prompt_id = excluded.prompt_id,
        message = excluded.message,
        lines_added = excluded.lines_added,
        lines_removed = excluded.lines_removed,
        chain_cost_usd = excluded.chain_cost_usd,
        committed_at = excluded.committed_at
    `);

    const transaction = this.db.transaction((commitRows: readonly PostgresCommitRow[]) => {
      for (const row of commitRows) {
        upsert.run(
          row.sha, row.session_id, row.prompt_id, row.message,
          row.lines_added, row.lines_removed, row.chain_cost_usd, row.committed_at
        );
      }
    });
    transaction(rows);
  }

  public async upsertPullRequests(rows: readonly PostgresPullRequestRow[]): Promise<void> {
    if (rows.length === 0) return;

    const upsert = this.db.prepare(`
      INSERT INTO pull_requests
        (session_id, repo, pr_number, state, url, merged_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, repo, pr_number) DO UPDATE SET
        state = excluded.state,
        url = COALESCE(excluded.url, pull_requests.url),
        merged_at = COALESCE(excluded.merged_at, pull_requests.merged_at)
    `);

    const transaction = this.db.transaction((prRows: readonly PostgresPullRequestRow[]) => {
      for (const row of prRows) {
        upsert.run(
          row.session_id, row.repo, row.pr_number, row.state, row.url, row.merged_at
        );
      }
    });
    transaction(rows);
  }

  public listPullRequestsBySessionId(sessionId: string): readonly PostgresPullRequestRow[] {
    const rows = this.db.prepare(
      "SELECT session_id, repo, pr_number, state, url, merged_at FROM pull_requests WHERE session_id = ? ORDER BY pr_number ASC"
    ).all(sessionId) as PostgresPullRequestRow[];
    return rows;
  }

  public listCommitsBySessionId(sessionId: string): readonly PostgresCommitReadRow[] {
    const rows = this.db.prepare(
      "SELECT sha, session_id, prompt_id, message, lines_added, lines_removed, committed_at FROM commits WHERE session_id = ? ORDER BY committed_at ASC"
    ).all(sessionId) as PostgresCommitReadRow[];
    return rows;
  }

  public listSessionTraces(limit = 200): readonly ClickHouseSessionTraceRow[] {
    const rows = this.db.prepare(
      `SELECT * FROM session_traces ORDER BY updated_at DESC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];
    return rows.map((raw) => ({
      session_id: raw["session_id"] as string,
      version: raw["version"] as number,
      started_at: raw["started_at"] as string,
      ended_at: (raw["ended_at"] as string | null) ?? null,
      user_id: raw["user_id"] as string,
      git_repo: (raw["git_repo"] as string | null) ?? null,
      git_branch: (raw["git_branch"] as string | null) ?? null,
      prompt_count: raw["prompt_count"] as number,
      tool_call_count: raw["tool_call_count"] as number,
      api_call_count: raw["api_call_count"] as number,
      total_cost_usd: raw["total_cost_usd"] as number,
      total_input_tokens: raw["total_input_tokens"] as number,
      total_output_tokens: raw["total_output_tokens"] as number,
      total_cache_read_tokens: (raw["total_cache_read_tokens"] as number) ?? 0,
      total_cache_write_tokens: (raw["total_cache_write_tokens"] as number) ?? 0,
      lines_added: raw["lines_added"] as number,
      lines_removed: raw["lines_removed"] as number,
      models_used: fromJsonArray(raw["models_used"]),
      tools_used: fromJsonArray(raw["tools_used"]),
      files_touched: fromJsonArray(raw["files_touched"]),
      commit_count: raw["commit_count"] as number,
      updated_at: raw["updated_at"] as string
    }));
  }

  public listEventsBySessionId(sessionId: string, limit = 2000): readonly ClickHouseAgentEventReadRow[] {
    const rows = this.db.prepare(
      `SELECT event_id, event_type, event_timestamp, session_id, prompt_id,
              tool_success, tool_name, tool_duration_ms, model, cost_usd,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, attributes
       FROM agent_events
       WHERE session_id = ?
       ORDER BY event_timestamp ASC
       LIMIT ?`
    ).all(sessionId, limit) as Record<string, unknown>[];
    return rows.map((raw) => ({
      event_id: raw["event_id"] as string,
      event_type: raw["event_type"] as string,
      event_timestamp: raw["event_timestamp"] as string,
      session_id: raw["session_id"] as string,
      prompt_id: (raw["prompt_id"] as string | null) ?? null,
      tool_success: raw["tool_success"] as number | null,
      tool_name: (raw["tool_name"] as string | null) ?? null,
      tool_duration_ms: raw["tool_duration_ms"] as number | null,
      model: (raw["model"] as string | null) ?? null,
      cost_usd: raw["cost_usd"] as number | null,
      input_tokens: raw["input_tokens"] as number | null,
      output_tokens: raw["output_tokens"] as number | null,
      cache_read_tokens: (raw["cache_read_tokens"] as number | null) ?? null,
      cache_write_tokens: (raw["cache_write_tokens"] as number | null) ?? null,
      attributes: fromJsonObject(raw["attributes"])
    }));
  }

  public listDailyCosts(limit = 30): readonly { date: string; totalCostUsd: number; sessionCount: number }[] {
    const rows = this.db.prepare(`
      SELECT
        substr(started_at, 1, 10) AS metric_date,
        COUNT(DISTINCT session_id) AS sessions_count,
        COALESCE(SUM(total_cost_usd), 0) AS total_cost_usd
      FROM session_traces
      GROUP BY metric_date
      ORDER BY metric_date ASC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map((raw) => ({
      date: raw["metric_date"] as string,
      totalCostUsd: Number((raw["total_cost_usd"] as number) ?? 0),
      sessionCount: Number((raw["sessions_count"] as number) ?? 0)
    }));
  }

  public getSetting(key: string): string | undefined {
    const row = this.db.prepare(
      "SELECT value FROM instance_settings WHERE key = ?"
    ).get(key) as { value: string } | undefined;
    return row?.value;
  }

  public upsertSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO instance_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, value);
  }

  public getTeamBudget(): { monthlyLimitUsd: number; alertThresholdPercent: number } | undefined {
    const row = this.db.prepare(
      "SELECT monthly_limit_usd, alert_threshold_percent FROM team_budgets WHERE id = 1"
    ).get() as { monthly_limit_usd: number; alert_threshold_percent: number } | undefined;
    if (row === undefined) return undefined;
    return {
      monthlyLimitUsd: row.monthly_limit_usd,
      alertThresholdPercent: row.alert_threshold_percent
    };
  }

  public upsertTeamBudget(limitUsd: number, alertPercent: number): void {
    this.db.prepare(`
      INSERT INTO team_budgets (id, monthly_limit_usd, alert_threshold_percent, updated_at)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        monthly_limit_usd = excluded.monthly_limit_usd,
        alert_threshold_percent = excluded.alert_threshold_percent,
        updated_at = excluded.updated_at
    `).run(limitUsd, alertPercent);
  }

  public getMonthSpend(yearMonth: string): number {
    const row = this.db.prepare(
      "SELECT COALESCE(SUM(total_cost_usd), 0) AS spend FROM session_traces WHERE substr(started_at, 1, 7) = ?"
    ).get(yearMonth) as { spend: number };
    return row.spend;
  }

  public close(): void {
    this.db.close();
  }

  /**
   * Migration: add cache_read_tokens / cache_write_tokens columns to existing databases.
   */
  private migrateCacheTokenColumns(): void {
    const addColumnIfMissing = (table: string, column: string, definition: string): void => {
      const cols = this.db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };

    const eventsExist = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_events'"
    ).get();
    if (eventsExist !== undefined) {
      addColumnIfMissing("agent_events", "cache_read_tokens", "INTEGER");
      addColumnIfMissing("agent_events", "cache_write_tokens", "INTEGER");
    }

    const tracesExist = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_traces'"
    ).get();
    if (tracesExist !== undefined) {
      addColumnIfMissing("session_traces", "total_cache_read_tokens", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing("session_traces", "total_cache_write_tokens", "INTEGER NOT NULL DEFAULT 0");
    }
  }

  /**
   * Migration: deduplicate agent_events rows from older schemas that lacked a UNIQUE constraint.
   * Runs once — if the old table exists without a unique index, it rebuilds it.
   */
  private migrateDeduplicateEvents(): void {
    // Check if agent_events table exists at all
    const tableExists = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_events'"
    ).get();
    if (tableExists === undefined) {
      return; // Fresh database — SCHEMA_SQL will create the table with UNIQUE
    }

    // Check if unique index already exists (either from UNIQUE column constraint or explicit index)
    const hasUniqueIndex = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='index' AND tbl_name='agent_events' AND sql LIKE '%UNIQUE%'"
    ).get();
    // Also check via pragma for autoindex created by UNIQUE column constraint
    const indexInfo = this.db.prepare("PRAGMA index_list('agent_events')").all() as Record<string, unknown>[];
    const hasAutoUnique = indexInfo.some((idx) => (idx["unique"] as number) === 1);

    if (hasUniqueIndex !== undefined || hasAutoUnique) {
      return; // Already migrated
    }

    // Count duplicates to log
    const countResult = this.db.prepare(
      "SELECT COUNT(*) as total FROM agent_events"
    ).get() as { total: number } | undefined;
    const distinctResult = this.db.prepare(
      "SELECT COUNT(DISTINCT event_id) as distinct_count FROM agent_events"
    ).get() as { distinct_count: number } | undefined;
    const total = countResult?.total ?? 0;
    const distinct = distinctResult?.distinct_count ?? 0;

    if (total === 0) {
      // Empty table — just drop and let SCHEMA_SQL recreate with UNIQUE
      this.db.exec("DROP TABLE agent_events");
      // Also clear session_traces so they rehydrate cleanly
      const tracesExist = this.db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_traces'"
      ).get();
      if (tracesExist !== undefined) {
        this.db.exec("DELETE FROM session_traces");
      }
      return;
    }

    console.log(`[agent-trace] migrating: deduplicating agent_events (${total} rows → ${distinct} distinct)`);

    // Rebuild: create clean table, copy distinct rows, swap
    this.db.exec(`
      CREATE TABLE agent_events_dedup (
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        event_timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        prompt_id TEXT,
        user_id TEXT NOT NULL DEFAULT 'unknown_user',
        source TEXT NOT NULL DEFAULT 'hook',
        agent_type TEXT NOT NULL DEFAULT 'claude_code',
        tool_name TEXT,
        tool_success INTEGER,
        tool_duration_ms REAL,
        model TEXT,
        cost_usd REAL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_tokens INTEGER,
        cache_write_tokens INTEGER,
        api_duration_ms REAL,
        lines_added INTEGER,
        lines_removed INTEGER,
        files_changed TEXT NOT NULL DEFAULT '[]',
        commit_sha TEXT,
        attributes TEXT NOT NULL DEFAULT '{}'
      );

      INSERT OR IGNORE INTO agent_events_dedup SELECT * FROM agent_events;

      DROP TABLE agent_events;
      ALTER TABLE agent_events_dedup RENAME TO agent_events;

      CREATE INDEX IF NOT EXISTS idx_events_session ON agent_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON agent_events(event_timestamp);
    `);

    const afterCount = this.db.prepare("SELECT COUNT(*) as c FROM agent_events").get() as { c: number };
    console.log(`[agent-trace] migration complete: ${afterCount.c} events after dedup (removed ${total - afterCount.c} duplicates)`);

    // Rebuild session_traces from deduplicated events
    this.rebuildSessionTracesFromEvents();
  }

  /**
   * Migration v2: fix databases that ran v0.2.6's broken rebuild (models_used='[]' with data present).
   * Re-runs the rebuild if session_traces exist but have empty models_used while events have model data.
   */
  private migrateRebuildBrokenTraces(): void {
    const tracesExist = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_traces'"
    ).get();
    if (tracesExist === undefined) {
      return;
    }

    // Check if any session_traces have models_used='[]' but events have model data
    const broken = this.db.prepare(`
      SELECT 1 FROM session_traces st
      WHERE st.models_used = '[]'
        AND EXISTS (
          SELECT 1 FROM agent_events ae
          WHERE ae.session_id = st.session_id AND ae.model IS NOT NULL
        )
      LIMIT 1
    `).get();

    if (broken === undefined) {
      return;
    }

    console.log("[agent-trace] migrating: rebuilding session traces with correct models/tools");
    this.rebuildSessionTracesFromEvents();
  }

  /**
   * Migration: add team-related columns and tables.
   */
  private migrateTeamColumns(): void {
    const addColumnIfMissing = (table: string, column: string, definition: string): void => {
      const cols = this.db.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };

    const tracesExist = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_traces'"
    ).get();
    if (tracesExist !== undefined) {
      addColumnIfMissing("session_traces", "user_email", "TEXT");
      addColumnIfMissing("session_traces", "user_display_name", "TEXT");
    }

    const eventsExist = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_events'"
    ).get();
    if (eventsExist !== undefined) {
      addColumnIfMissing("agent_events", "user_email", "TEXT");
    }

    // Create team_budgets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS team_budgets (
        id INTEGER PRIMARY KEY DEFAULT 1,
        monthly_limit_usd REAL NOT NULL,
        alert_threshold_percent REAL NOT NULL DEFAULT 80,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create indexes for team queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_traces_started_at ON session_traces(started_at);
      CREATE INDEX IF NOT EXISTS idx_traces_user_id ON session_traces(user_id)
    `);
  }

  /**
   * Rebuild session_traces by aggregating deduplicated agent_events.
   * Called after dedup migration so the dashboard has correct metrics immediately.
   */
  private rebuildSessionTracesFromEvents(): void {
    const tracesExist = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_traces'"
    ).get();
    if (tracesExist === undefined) {
      return;
    }

    this.db.exec("DELETE FROM session_traces");

    // Pass 1: aggregate numeric metrics
    this.db.exec(`
      INSERT OR REPLACE INTO session_traces
        (session_id, version, started_at, ended_at, user_id, git_repo, git_branch,
         prompt_count, tool_call_count, api_call_count, total_cost_usd,
         total_input_tokens, total_output_tokens, total_cache_read_tokens, total_cache_write_tokens,
         lines_added, lines_removed,
         models_used, tools_used, files_touched, commit_count, updated_at)
      SELECT
        session_id,
        1,
        MIN(event_timestamp),
        MAX(event_timestamp),
        COALESCE(MAX(CASE WHEN user_id != 'unknown_user' THEN user_id END), 'unknown_user'),
        NULL,
        NULL,
        SUM(CASE WHEN event_type LIKE '%prompt%' THEN 1 ELSE 0 END),
        SUM(CASE WHEN event_type LIKE '%tool%' THEN 1 ELSE 0 END),
        SUM(CASE WHEN event_type LIKE '%api%' THEN 1 ELSE 0 END),
        COALESCE(SUM(cost_usd), 0),
        COALESCE(SUM(input_tokens), 0),
        COALESCE(SUM(output_tokens), 0),
        COALESCE(SUM(cache_read_tokens), 0),
        COALESCE(SUM(cache_write_tokens), 0),
        COALESCE(SUM(lines_added), 0),
        COALESCE(SUM(lines_removed), 0),
        '[]',
        '[]',
        '[]',
        COUNT(DISTINCT commit_sha),
        MAX(event_timestamp)
      FROM agent_events
      GROUP BY session_id
    `);

    // Pass 2: populate models_used, tools_used, files_touched from event data
    const sessionIds = this.db.prepare(
      "SELECT DISTINCT session_id FROM agent_events"
    ).all() as { session_id: string }[];

    const updateArrays = this.db.prepare(
      "UPDATE session_traces SET models_used = ?, tools_used = ?, files_touched = ? WHERE session_id = ?"
    );

    const transaction = this.db.transaction((ids: { session_id: string }[]) => {
      for (const { session_id } of ids) {
        const models = this.db.prepare(
          "SELECT DISTINCT model FROM agent_events WHERE session_id = ? AND model IS NOT NULL"
        ).all(session_id) as { model: string }[];
        const tools = this.db.prepare(
          "SELECT DISTINCT tool_name FROM agent_events WHERE session_id = ? AND tool_name IS NOT NULL"
        ).all(session_id) as { tool_name: string }[];
        const files = this.db.prepare(
          "SELECT DISTINCT commit_sha FROM agent_events WHERE session_id = ? AND commit_sha IS NOT NULL"
        ).all(session_id) as { commit_sha: string }[];

        updateArrays.run(
          JSON.stringify(models.map((r) => r.model)),
          JSON.stringify(tools.map((r) => r.tool_name)),
          JSON.stringify(files.map((r) => r.commit_sha)),
          session_id
        );
      }
    });
    transaction(sessionIds);

    const rebuilt = this.db.prepare("SELECT COUNT(*) as c FROM session_traces").get() as { c: number };
    console.log(`[agent-trace] rebuilt ${rebuilt.c} session traces from deduplicated events`);
  }

  private insertEvents(rows: readonly ClickHouseAgentEventRow[]): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO agent_events
        (event_id, event_type, event_timestamp, session_id, prompt_id, user_id, source, agent_type,
         tool_name, tool_success, tool_duration_ms, model, cost_usd, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens,
         api_duration_ms, lines_added, lines_removed, files_changed, commit_sha, attributes)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((eventRows: readonly ClickHouseAgentEventRow[]) => {
      for (const row of eventRows) {
        insert.run(
          row.event_id, row.event_type, row.event_timestamp, row.session_id,
          row.prompt_id, row.user_id, row.source, row.agent_type,
          row.tool_name, row.tool_success, row.tool_duration_ms, row.model,
          row.cost_usd, row.input_tokens, row.output_tokens,
          row.cache_read_tokens, row.cache_write_tokens,
          row.api_duration_ms,
          row.lines_added, row.lines_removed,
          toJsonArray(row.files_changed as string[]),
          row.commit_sha,
          JSON.stringify(row.attributes)
        );
      }
    });
    transaction(rows);
  }

  private translateQuery(query: string): string {
    let q = query;
    q = q.replace(/\bFINAL\b/g, "");
    q = q.replace(/::jsonb/g, "");
    return q.trim();
  }

  private normalizeRow<TRow>(raw: Record<string, unknown>, originalQuery: string): TRow {
    const isSessionTrace = originalQuery.includes("session_traces");
    const isEvent = originalQuery.includes("agent_events");
    const isDailyCost = originalQuery.includes("daily_user_metrics") || originalQuery.includes("metric_date");

    if (isSessionTrace) {
      return {
        ...raw,
        models_used: fromJsonArray(raw["models_used"]),
        tools_used: fromJsonArray(raw["tools_used"]),
        files_touched: fromJsonArray(raw["files_touched"])
      } as TRow;
    }

    if (isEvent) {
      return {
        ...raw,
        attributes: fromJsonObject(raw["attributes"])
      } as TRow;
    }

    if (isDailyCost) {
      return raw as TRow;
    }

    return raw as TRow;
  }
}

export function createSqliteClient(dbPath: string): SqliteClient {
  return new SqliteClient(dbPath);
}

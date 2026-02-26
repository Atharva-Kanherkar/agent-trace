import assert from "node:assert/strict";
import test from "node:test";

import {
  ClickHouseSessionTraceReader,
  toAgentSessionTraceFromClickHouseRow
} from "../src/clickhouse-session-trace-reader";
import type { ClickHouseQueryClient, ClickHouseSessionTraceRow } from "../src/persistence-types";

class MockQueryClient implements ClickHouseQueryClient {
  public readonly queries: string[] = [];
  private readonly rowsByQuery: Map<string, readonly ClickHouseSessionTraceRow[]>;

  public constructor(rowsByQuery: Readonly<Record<string, readonly ClickHouseSessionTraceRow[]>>) {
    this.rowsByQuery = new Map<string, readonly ClickHouseSessionTraceRow[]>(
      Object.keys(rowsByQuery).map((query) => [query, rowsByQuery[query] ?? []])
    );
  }

  public async queryJsonEachRow<TRow>(query: string): Promise<readonly TRow[]> {
    this.queries.push(query);
    return (this.rowsByQuery.get(query) ?? []) as unknown as readonly TRow[];
  }
}

function createRow(overrides: Partial<ClickHouseSessionTraceRow> = {}): ClickHouseSessionTraceRow {
  return {
    session_id: "sess_trace_reader_001",
    version: 10,
    started_at: "2026-02-23T10:00:00.000Z",
    ended_at: "2026-02-23T10:05:00.000Z",
    user_id: "user_trace_reader_001",
    git_repo: "Atharva-Kanherkar/agent-trace",
    git_branch: "main",
    prompt_count: 5,
    tool_call_count: 8,
    api_call_count: 5,
    total_cost_usd: 0.44,
    total_input_tokens: 1500,
    total_output_tokens: 420,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    lines_added: 21,
    lines_removed: 6,
    models_used: ["claude-sonnet-4", "claude-sonnet-4"],
    tools_used: ["Read", "Edit", "Read"],
    files_touched: ["README.md", "src/runtime.ts", "README.md"],
    commit_count: 0,
    updated_at: "2026-02-23T10:05:01.000Z",
    ...overrides
  };
}

test("toAgentSessionTraceFromClickHouseRow maps session trace row into AgentSessionTrace", () => {
  const trace = toAgentSessionTraceFromClickHouseRow(createRow());

  assert.equal(trace.sessionId, "sess_trace_reader_001");
  assert.equal(trace.agentType, "claude_code");
  assert.equal(trace.user.id, "user_trace_reader_001");
  assert.equal(trace.environment.gitRepo, "Atharva-Kanherkar/agent-trace");
  assert.equal(trace.environment.gitBranch, "main");
  assert.equal(trace.metrics.promptCount, 5);
  assert.equal(trace.metrics.toolCallCount, 8);
  assert.equal(trace.metrics.apiCallCount, 5);
  assert.equal(trace.metrics.totalCostUsd, 0.44);
  assert.equal(trace.metrics.totalInputTokens, 1500);
  assert.equal(trace.metrics.totalOutputTokens, 420);
  assert.equal(trace.metrics.linesAdded, 21);
  assert.equal(trace.metrics.linesRemoved, 6);
  assert.deepEqual(trace.metrics.modelsUsed, ["claude-sonnet-4"]);
  assert.deepEqual(trace.metrics.toolsUsed, ["Read", "Edit"]);
  assert.deepEqual(trace.metrics.filesTouched, ["README.md", "src/runtime.ts"]);
  assert.equal(trace.activeDurationMs, 300000);
  assert.equal(trace.timeline.length, 0);
  assert.equal(trace.git.commits.length, 0);
});

test("ClickHouseSessionTraceReader listLatest issues FINAL query and maps rows", async () => {
  const expectedQuery = [
    "SELECT session_id, version, started_at, ended_at, user_id, git_repo, git_branch, prompt_count, tool_call_count, api_call_count, total_cost_usd, total_input_tokens, total_output_tokens, lines_added, lines_removed, models_used, tools_used, files_touched, commit_count, updated_at",
    "FROM session_traces",
    "FINAL",
    "ORDER BY updated_at DESC",
    "LIMIT 3"
  ].join(" ");

  const client = new MockQueryClient({
    [expectedQuery]: [createRow()]
  });
  const reader = new ClickHouseSessionTraceReader(client);
  const traces = await reader.listLatest(3);

  assert.equal(client.queries.length, 1);
  assert.equal(client.queries[0], expectedQuery);
  assert.equal(traces.length, 1);
  assert.equal(traces[0]?.sessionId, "sess_trace_reader_001");
});

test("ClickHouseSessionTraceReader getBySessionId escapes session id and returns undefined when missing", async () => {
  const expectedQuery = [
    "SELECT session_id, version, started_at, ended_at, user_id, git_repo, git_branch, prompt_count, tool_call_count, api_call_count, total_cost_usd, total_input_tokens, total_output_tokens, lines_added, lines_removed, models_used, tools_used, files_touched, commit_count, updated_at",
    "FROM session_traces",
    "FINAL",
    "WHERE session_id = 'sess_''quoted'",
    "ORDER BY version DESC",
    "LIMIT 1"
  ].join(" ");

  const client = new MockQueryClient({
    [expectedQuery]: []
  });
  const reader = new ClickHouseSessionTraceReader(client);

  const trace = await reader.getBySessionId("sess_'quoted");

  assert.equal(client.queries.length, 1);
  assert.equal(client.queries[0], expectedQuery);
  assert.equal(trace, undefined);
});

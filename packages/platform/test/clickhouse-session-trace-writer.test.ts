import assert from "node:assert/strict";
import test from "node:test";

import type { AgentSessionTrace } from "../../schema/src/types";
import { ClickHouseSessionTraceWriter, toClickHouseSessionTraceRow } from "../src/clickhouse-session-trace-writer";
import type {
  ClickHouseInsertClient,
  ClickHouseInsertRequest,
  ClickHouseSessionTraceRow
} from "../src/persistence-types";

class MockInsertClient implements ClickHouseInsertClient<ClickHouseSessionTraceRow> {
  public readonly requests: ClickHouseInsertRequest<ClickHouseSessionTraceRow>[] = [];

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseSessionTraceRow>): Promise<void> {
    this.requests.push(request);
  }
}

function createSampleTrace(overrides: Partial<AgentSessionTrace> = {}): AgentSessionTrace {
  return {
    sessionId: "sess_trace_001",
    agentType: "claude_code",
    user: {
      id: "user_001"
    },
    environment: {
      terminal: "bash",
      projectPath: "/repo",
      gitRepo: "Atharva-Kanherkar/agent-trace",
      gitBranch: "main"
    },
    startedAt: "2026-02-23T10:00:00.000Z",
    endedAt: "2026-02-23T10:05:00.000Z",
    activeDurationMs: 300000,
    timeline: [],
    metrics: {
      promptCount: 4,
      apiCallCount: 4,
      toolCallCount: 7,
      totalCostUsd: 0.19,
      totalInputTokens: 1200,
      totalOutputTokens: 280,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      linesAdded: 18,
      linesRemoved: 4,
      filesTouched: ["README.md", "README.md", "docs/HLD_LLD.md"],
      modelsUsed: ["claude-sonnet-4", "claude-sonnet-4"],
      toolsUsed: ["Read", "Edit", "Read"]
    },
    git: {
      commits: [],
      pullRequests: []
    },
    ...overrides
  };
}

test("toClickHouseSessionTraceRow maps trace metrics and normalizes arrays", () => {
  const row = toClickHouseSessionTraceRow(createSampleTrace(), 0, "2026-02-23T10:05:01.000Z");

  assert.equal(row.session_id, "sess_trace_001");
  assert.equal(row.version, 1);
  assert.equal(row.started_at, "2026-02-23 10:00:00.000");
  assert.equal(row.ended_at, "2026-02-23 10:05:00.000");
  assert.equal(row.user_id, "user_001");
  assert.equal(row.git_repo, "Atharva-Kanherkar/agent-trace");
  assert.equal(row.prompt_count, 4);
  assert.equal(row.tool_call_count, 7);
  assert.equal(row.api_call_count, 4);
  assert.equal(row.total_cost_usd, 0.19);
  assert.equal(row.total_input_tokens, 1200);
  assert.equal(row.total_output_tokens, 280);
  assert.equal(row.lines_added, 18);
  assert.equal(row.lines_removed, 4);
  assert.deepEqual(row.models_used, ["claude-sonnet-4"]);
  assert.deepEqual(row.tools_used, ["Read", "Edit"]);
  assert.deepEqual(row.files_touched, ["README.md", "docs/HLD_LLD.md"]);
  assert.equal(row.commit_count, 0);
  assert.equal(row.updated_at, "2026-02-23 10:05:01.000");
});

test("ClickHouseSessionTraceWriter writes mapped rows to configured table", async () => {
  const client = new MockInsertClient();
  const writer = new ClickHouseSessionTraceWriter(client, {
    tableName: "session_traces_test",
    versionProvider: () => 42,
    updatedAtProvider: () => "2026-02-23T10:05:01.000Z"
  });

  const result = await writer.writeTraces([
    createSampleTrace(),
    createSampleTrace({
      sessionId: "sess_trace_002",
      user: { id: "user_002" }
    })
  ]);

  assert.equal(result.tableName, "session_traces_test");
  assert.equal(result.writtenRows, 2);
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0]?.table, "session_traces_test");
  assert.equal(client.requests[0]?.rows.length, 2);
  assert.equal(client.requests[0]?.rows[0]?.version, 42);
  assert.equal(client.requests[0]?.rows[1]?.version, 43);
  assert.equal(client.requests[0]?.rows[0]?.updated_at, "2026-02-23 10:05:01.000");
});

test("ClickHouseSessionTraceWriter skips insert when trace list is empty", async () => {
  const client = new MockInsertClient();
  const writer = new ClickHouseSessionTraceWriter(client);

  const result = await writer.writeTraces([]);
  assert.equal(result.writtenRows, 0);
  assert.equal(result.tableName, "session_traces");
  assert.equal(client.requests.length, 0);
});

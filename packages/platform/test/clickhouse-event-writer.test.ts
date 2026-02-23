import assert from "node:assert/strict";
import test from "node:test";

import { ClickHouseEventWriter, toClickHouseAgentEventRow } from "../src/clickhouse-event-writer";
import type {
  ClickHouseAgentEventRow,
  ClickHouseInsertRequest,
  ClickHouseInsertClient,
  PlatformEventEnvelope
} from "../src/persistence-types";

class MockInsertClient implements ClickHouseInsertClient<ClickHouseAgentEventRow> {
  public readonly requests: ClickHouseInsertRequest<ClickHouseAgentEventRow>[] = [];

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    this.requests.push(request);
  }
}

function createSampleEnvelope(
  overrides: Partial<PlatformEventEnvelope> = {},
  options: {
    readonly includePromptId?: boolean;
    readonly includeSourceVersion?: boolean;
  } = {}
): PlatformEventEnvelope {
  const includePromptId = options.includePromptId ?? true;
  const includeSourceVersion = options.includeSourceVersion ?? true;

  return {
    schemaVersion: "1.0",
    source: "hook",
    ...(includeSourceVersion ? { sourceVersion: "agent-trace-cli-v0.1" } : {}),
    eventId: "evt_001",
    sessionId: "sess_001",
    ...(includePromptId ? { promptId: "prompt_001" } : {}),
    eventType: "tool_result",
    eventTimestamp: "2026-02-23T10:00:00.000Z",
    ingestedAt: "2026-02-23T10:00:01.000Z",
    privacyTier: 2,
    payload: {
      user_id: "user_001",
      agent_type: "claude_code",
      tool_name: "Read",
      tool_success: true,
      tool_duration_ms: 210,
      model: "claude-sonnet-4",
      cost_usd: 0.017,
      input_tokens: 1400,
      output_tokens: 220,
      api_duration_ms: 1200,
      lines_added: 12,
      lines_removed: 3,
      files_changed: ["README.md", "packages/schema/src/types.ts"],
      commit_sha: "abc123"
    },
    attributes: {
      terminal: "bash"
    },
    ...overrides
  };
}

test("toClickHouseAgentEventRow maps envelope payload fields to clickhouse row", () => {
  const row = toClickHouseAgentEventRow(createSampleEnvelope());

  assert.equal(row.event_id, "evt_001");
  assert.equal(row.session_id, "sess_001");
  assert.equal(row.prompt_id, "prompt_001");
  assert.equal(row.user_id, "user_001");
  assert.equal(row.agent_type, "claude_code");
  assert.equal(row.tool_name, "Read");
  assert.equal(row.tool_success, 1);
  assert.equal(row.input_tokens, 1400);
  assert.equal(row.output_tokens, 220);
  assert.equal(row.cost_usd, 0.017);
  assert.equal(row.commit_sha, "abc123");
  assert.deepEqual(row.files_changed, ["README.md", "packages/schema/src/types.ts"]);
  assert.equal(row.attributes["terminal"], "bash");
  assert.equal(row.attributes["privacy_tier"], "2");
  assert.equal(row.attributes["source_version"], "agent-trace-cli-v0.1");
});

test("toClickHouseAgentEventRow applies defaults for missing payload fields", () => {
  const row = toClickHouseAgentEventRow(
    createSampleEnvelope({ payload: {} }, { includePromptId: false, includeSourceVersion: false })
  );

  assert.equal(row.prompt_id, null);
  assert.equal(row.user_id, "unknown_user");
  assert.equal(row.agent_type, "claude_code");
  assert.equal(row.tool_name, null);
  assert.equal(row.tool_success, null);
  assert.equal(row.cost_usd, null);
  assert.deepEqual(row.files_changed, []);
  assert.equal(row.attributes["privacy_tier"], "2");
  assert.equal("source_version" in row.attributes, false);
});

test("ClickHouseEventWriter writes mapped rows to configured table", async () => {
  const client = new MockInsertClient();
  const writer = new ClickHouseEventWriter(client, {
    tableName: "agent_events_test"
  });

  const result = await writer.writeEvents([
    createSampleEnvelope(),
    createSampleEnvelope({
      eventId: "evt_002",
      eventType: "api_request"
    })
  ]);

  assert.equal(result.tableName, "agent_events_test");
  assert.equal(result.writtenRows, 2);
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0]?.table, "agent_events_test");
  assert.equal(client.requests[0]?.rows.length, 2);
  assert.equal(client.requests[0]?.rows[1]?.event_id, "evt_002");
});

test("ClickHouseEventWriter skips insert when event list is empty", async () => {
  const client = new MockInsertClient();
  const writer = new ClickHouseEventWriter(client);

  const result = await writer.writeEvents([]);
  assert.equal(result.writtenRows, 0);
  assert.equal(result.tableName, "agent_events");
  assert.equal(client.requests.length, 0);
});

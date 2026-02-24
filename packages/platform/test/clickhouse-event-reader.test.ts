import assert from "node:assert/strict";
import test from "node:test";

import { ClickHouseEventReader, toTimelineEventFromClickHouseRow } from "../src/clickhouse-event-reader";
import type { ClickHouseAgentEventReadRow, ClickHouseQueryClient } from "../src/persistence-types";

class MockQueryClient implements ClickHouseQueryClient {
  public readonly queries: string[] = [];
  private readonly rowsByQuery: Map<string, readonly ClickHouseAgentEventReadRow[]>;

  public constructor(rowsByQuery: Readonly<Record<string, readonly ClickHouseAgentEventReadRow[]>>) {
    this.rowsByQuery = new Map<string, readonly ClickHouseAgentEventReadRow[]>(
      Object.keys(rowsByQuery).map((query) => [query, rowsByQuery[query] ?? []])
    );
  }

  public async queryJsonEachRow<TRow>(query: string): Promise<readonly TRow[]> {
    this.queries.push(query);
    return (this.rowsByQuery.get(query) ?? []) as unknown as readonly TRow[];
  }
}

function createRow(overrides: Partial<ClickHouseAgentEventReadRow> = {}): ClickHouseAgentEventReadRow {
  return {
    event_id: "1520751b-9d07-5530-86dd-dd75d2d557ec",
    event_type: "tool_result",
    event_timestamp: "2026-02-24 12:00:00.000",
    session_id: "sess_event_reader_001",
    prompt_id: "prompt_event_reader_001",
    tool_success: 1,
    tool_name: "Read",
    tool_duration_ms: null,
    model: null,
    cost_usd: "0.02",
    input_tokens: 120,
    output_tokens: 40,
    attributes: {
      event_id_raw: "evt_manual_e2e_001",
      hook_name: "PostToolUse"
    },
    ...overrides
  };
}

test("toTimelineEventFromClickHouseRow maps clickhouse row into timeline event", () => {
  const timelineEvent = toTimelineEventFromClickHouseRow(createRow());

  assert.equal(timelineEvent.id, "evt_manual_e2e_001");
  assert.equal(timelineEvent.type, "tool_result");
  assert.equal(timelineEvent.timestamp, "2026-02-24T12:00:00.000Z");
  assert.equal(timelineEvent.promptId, "prompt_event_reader_001");
  assert.equal(timelineEvent.status, "success");
  assert.equal(timelineEvent.costUsd, 0.02);
  assert.deepEqual(timelineEvent.tokens, {
    input: 120,
    output: 40
  });
});

test("toTimelineEventFromClickHouseRow extracts prompt_text from attributes into details.promptText", () => {
  const row = createRow({
    event_type: "user_prompt",
    tool_name: null,
    tool_success: null,
    cost_usd: null,
    input_tokens: null,
    output_tokens: null,
    attributes: {
      event_id_raw: "evt_prompt_001",
      prompt_text: "What is the meaning of life?"
    }
  });
  const event = toTimelineEventFromClickHouseRow(row);
  assert.equal(event.details?.["promptText"], "What is the meaning of life?");
});

test("toTimelineEventFromClickHouseRow extracts response_text and model from attributes and columns", () => {
  const row = createRow({
    event_type: "api_response",
    tool_name: null,
    tool_success: null,
    model: "claude-opus-4-6",
    cost_usd: "0.05",
    input_tokens: 100,
    output_tokens: 50,
    attributes: {
      event_id_raw: "evt_response_001",
      response_text: "The answer is 42."
    }
  });
  const event = toTimelineEventFromClickHouseRow(row);
  assert.equal(event.details?.["responseText"], "The answer is 42.");
  assert.equal(event.details?.["model"], "claude-opus-4-6");
  assert.equal(event.costUsd, 0.05);
  assert.deepEqual(event.tokens, { input: 100, output: 50 });
});

test("toTimelineEventFromClickHouseRow parses tool_input JSON from attributes", () => {
  const row = createRow({
    event_type: "api_tool_use",
    tool_name: "Edit",
    attributes: {
      event_id_raw: "evt_tool_001",
      tool_input: JSON.stringify({ file_path: "/src/main.ts", old_string: "foo", new_string: "bar" })
    }
  });
  const event = toTimelineEventFromClickHouseRow(row);
  const toolInput = event.details?.["toolInput"] as Record<string, unknown> | undefined;
  assert.notEqual(toolInput, undefined, "expected toolInput in details");
  assert.equal(toolInput?.["file_path"], "/src/main.ts");
});

test("ClickHouseEventReader listTimelineBySessionId builds query and maps rows", async () => {
  const expectedQuery = [
    "SELECT event_id, event_type, event_timestamp, session_id, prompt_id, tool_success, tool_name, tool_duration_ms, model, cost_usd, input_tokens, output_tokens, attributes",
    "FROM agent_events",
    "WHERE session_id = 'sess_''quoted'",
    "ORDER BY event_timestamp ASC",
    "LIMIT 2"
  ].join(" ");
  const client = new MockQueryClient({
    [expectedQuery]: [createRow({ session_id: "sess_'quoted" })]
  });

  const reader = new ClickHouseEventReader(client);
  const timeline = await reader.listTimelineBySessionId("sess_'quoted", 2);

  assert.equal(client.queries.length, 1);
  assert.equal(client.queries[0], expectedQuery);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0]?.id, "evt_manual_e2e_001");
});

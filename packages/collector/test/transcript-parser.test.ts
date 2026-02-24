import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseTranscriptJsonl } from "../src";

function createTempTranscriptFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-transcript-test-"));
  const filePath = path.join(dir, "session.jsonl");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("parseTranscriptJsonl parses valid transcript lines into envelopes", () => {
  const filePath = createTempTranscriptFile(
    `${JSON.stringify({
      session_id: "sess_transcript_001",
      prompt_id: "prompt_001",
      event: "user_prompt",
      timestamp: "2026-02-23T10:00:00.000Z",
      text: "hello"
    })}\n${JSON.stringify({
      session_id: "sess_transcript_001",
      event: "tool_result",
      timestamp: "2026-02-23T10:00:01.000Z",
      tool_name: "Read"
    })}\n`
  );

  const result = parseTranscriptJsonl({
    filePath,
    privacyTier: 2,
    ingestedAt: "2026-02-23T10:01:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.parsedEvents.length, 2);
  assert.equal(result.skippedLines, 0);
  assert.equal(result.parsedEvents[0]?.source, "transcript");
  assert.equal(result.parsedEvents[0]?.sessionId, "sess_transcript_001");
  assert.equal(result.parsedEvents[0]?.promptId, "prompt_001");
  assert.equal(result.parsedEvents[0]?.privacyTier, 2);
  assert.equal(result.parsedEvents[0]?.attributes?.["transcript_line"], "1");

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test("parseTranscriptJsonl reports invalid lines and keeps valid parsed events", () => {
  const filePath = createTempTranscriptFile(
    `${JSON.stringify({
      event: "session_start",
      timestamp: "2026-02-23T10:00:00.000Z"
    })}\nnot json\n${JSON.stringify({
      session_id: "sess_transcript_002",
      event: "tool_result",
      timestamp: "2026-02-23T10:00:02.000Z"
    })}\n`
  );

  const result = parseTranscriptJsonl({
    filePath,
    privacyTier: 1,
    ingestedAt: "2026-02-23T10:01:00.000Z"
  });

  assert.equal(result.ok, false);
  assert.equal(result.parsedEvents.length, 1);
  assert.equal(result.skippedLines, 2);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors.some((entry) => entry.includes("invalid JSON")), true);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test("parseTranscriptJsonl uses fallback session id when line session id is missing", () => {
  const filePath = createTempTranscriptFile(
    `${JSON.stringify({
      event: "assistant_response",
      timestamp: "2026-02-23T10:00:05.000Z"
    })}\n`
  );

  const result = parseTranscriptJsonl({
    filePath,
    privacyTier: 1,
    sessionIdFallback: "sess_transcript_fallback",
    ingestedAt: "2026-02-23T10:01:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.parsedEvents.length, 1);
  assert.equal(result.parsedEvents[0]?.sessionId, "sess_transcript_fallback");

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test("parseTranscriptJsonl returns failure when transcript file does not exist", () => {
  const result = parseTranscriptJsonl({
    filePath: "/tmp/agent-trace-does-not-exist/session.jsonl",
    privacyTier: 1
  });

  assert.equal(result.ok, false);
  assert.equal(result.parsedEvents.length, 0);
  assert.equal(result.errors[0], "transcript file does not exist");
});

test("parseTranscriptJsonl normalizes Claude user and assistant records", () => {
  const filePath = createTempTranscriptFile(
    `${JSON.stringify({
      sessionId: "sess_claude_transcript_001",
      type: "user",
      timestamp: "2026-02-24T11:19:37.000Z",
      uuid: "uuid_user_prompt_1",
      message: {
        role: "user",
        content: "show me one file"
      }
    })}\n${JSON.stringify({
      sessionId: "sess_claude_transcript_001",
      type: "assistant",
      timestamp: "2026-02-24T11:19:39.000Z",
      requestId: "req_transcript_001",
      message: {
        id: "msg_transcript_001",
        role: "assistant",
        model: "claude-opus-4-6",
        content: [{ type: "text", text: "ok" }],
        usage: {
          input_tokens: 3,
          output_tokens: 8,
          cache_read_input_tokens: 13
        }
      }
    })}\n`
  );

  const result = parseTranscriptJsonl({
    filePath,
    privacyTier: 1,
    ingestedAt: "2026-02-24T11:20:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.parsedEvents.length, 2);
  assert.equal(result.parsedEvents[0]?.eventType, "user_prompt");
  assert.equal(result.parsedEvents[0]?.promptId, "uuid_user_prompt_1");
  assert.equal(result.parsedEvents[0]?.payload["prompt_text"], "show me one file");
  assert.equal(result.parsedEvents[1]?.eventType, "api_response");
  assert.equal(result.parsedEvents[1]?.payload["model"], "claude-opus-4-6");
  assert.equal(result.parsedEvents[1]?.payload["input_tokens"], 3);
  assert.equal(result.parsedEvents[1]?.payload["output_tokens"], 8);
  assert.equal(result.parsedEvents[1]?.payload["cache_read_tokens"], 13);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test("parseTranscriptJsonl maps assistant tool_use blocks to api_tool_use metadata", () => {
  const filePath = createTempTranscriptFile(
    `${JSON.stringify({
      sessionId: "sess_claude_transcript_002",
      type: "assistant",
      timestamp: "2026-02-24T11:20:10.000Z",
      message: {
        id: "msg_transcript_002",
        role: "assistant",
        model: "claude-opus-4-6",
        content: [
          {
            type: "tool_use",
            id: "toolu_123",
            name: "Read",
            input: { file_path: "/tmp/demo.txt" }
          }
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 12
        }
      }
    })}\n`
  );

  const result = parseTranscriptJsonl({
    filePath,
    privacyTier: 1,
    ingestedAt: "2026-02-24T11:20:11.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.parsedEvents.length, 1);
  assert.equal(result.parsedEvents[0]?.eventType, "api_tool_use");
  assert.equal(result.parsedEvents[0]?.payload["tool_name"], "Read");
  assert.equal(result.parsedEvents[0]?.payload["tool_use_id"], "toolu_123");
  assert.equal(result.parsedEvents[0]?.payload["file_path"], "/tmp/demo.txt");
  assert.equal(result.parsedEvents[0]?.payload["input_tokens"], 5);
  assert.equal(result.parsedEvents[0]?.payload["output_tokens"], 12);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

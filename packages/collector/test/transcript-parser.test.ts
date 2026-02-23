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

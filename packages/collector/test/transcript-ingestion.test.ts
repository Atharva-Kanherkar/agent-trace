import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { EventEnvelope } from "../../schema/src/types";
import { createTranscriptIngestionProcessor } from "../src";
import type { TranscriptEventPayload, TranscriptIngestionSink } from "../src/types";

function createTempTranscriptFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-transcript-ingest-test-"));
  const filePath = path.join(dir, "session.jsonl");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function createTranscriptTriggerEvent(
  transcriptPath: string,
  overrides: Partial<EventEnvelope<TranscriptEventPayload>> = {}
): EventEnvelope<TranscriptEventPayload> {
  return {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: "evt_transcript_trigger",
    sessionId: "sess_transcript_trigger",
    eventType: "session_end",
    eventTimestamp: "2026-02-23T10:10:00.000Z",
    ingestedAt: "2026-02-23T10:10:05.000Z",
    privacyTier: 1,
    payload: {
      transcript_path: transcriptPath
    },
    ...overrides
  };
}

class RecordingTranscriptSink implements TranscriptIngestionSink {
  public readonly ingestedBatches: Array<readonly EventEnvelope<TranscriptEventPayload>[]> = [];

  public async ingestTranscriptEvents(events: readonly EventEnvelope<TranscriptEventPayload>[]): Promise<void> {
    this.ingestedBatches.push(events);
  }
}

test("transcript ingestion processor parses session-end transcript and forwards events", async () => {
  const transcriptPath = createTempTranscriptFile(
    `${JSON.stringify({
      session_id: "sess_transcript_trigger",
      event: "assistant_response",
      timestamp: "2026-02-23T10:10:01.000Z"
    })}\n`
  );
  const sink = new RecordingTranscriptSink();
  const processor = createTranscriptIngestionProcessor({
    sink
  });

  await processor.processAcceptedEvent(createTranscriptTriggerEvent(transcriptPath));

  assert.equal(sink.ingestedBatches.length, 1);
  assert.equal(sink.ingestedBatches[0]?.length, 1);
  assert.equal(sink.ingestedBatches[0]?.[0]?.source, "transcript");
  assert.equal(sink.ingestedBatches[0]?.[0]?.sessionId, "sess_transcript_trigger");

  fs.rmSync(path.dirname(transcriptPath), { recursive: true, force: true });
});

test("transcript ingestion processor ignores non-session-end events", async () => {
  const transcriptPath = createTempTranscriptFile(
    `${JSON.stringify({
      session_id: "sess_transcript_trigger",
      event: "assistant_response",
      timestamp: "2026-02-23T10:10:01.000Z"
    })}\n`
  );
  const sink = new RecordingTranscriptSink();
  const processor = createTranscriptIngestionProcessor({
    sink
  });

  await processor.processAcceptedEvent(
    createTranscriptTriggerEvent(transcriptPath, {
      eventType: "tool_result"
    })
  );

  assert.equal(sink.ingestedBatches.length, 0);
  fs.rmSync(path.dirname(transcriptPath), { recursive: true, force: true });
});

test("transcript ingestion processor reports parse errors and still forwards valid lines", async () => {
  const transcriptPath = createTempTranscriptFile(
    `not-json\n${JSON.stringify({
      session_id: "sess_transcript_trigger",
      event: "assistant_response",
      timestamp: "2026-02-23T10:10:01.000Z"
    })}\n`
  );
  const sink = new RecordingTranscriptSink();
  const parseErrors: string[] = [];
  const processor = createTranscriptIngestionProcessor({
    sink,
    onParseErrors: (errors: readonly string[]): void => {
      parseErrors.push(...errors);
    }
  });

  await processor.processAcceptedEvent(createTranscriptTriggerEvent(transcriptPath));

  assert.equal(parseErrors.length, 1);
  assert.equal(parseErrors[0]?.includes("invalid JSON"), true);
  assert.equal(sink.ingestedBatches.length, 1);
  assert.equal(sink.ingestedBatches[0]?.length, 1);

  fs.rmSync(path.dirname(transcriptPath), { recursive: true, force: true });
});

test("transcript ingestion processor skips when transcript path is missing", async () => {
  const sink = new RecordingTranscriptSink();
  const processor = createTranscriptIngestionProcessor({
    sink
  });

  await processor.processAcceptedEvent(
    createTranscriptTriggerEvent("/tmp/unused", {
      payload: {}
    })
  );

  assert.equal(sink.ingestedBatches.length, 0);
});

test("transcript ingestion processor ignores transcript-source events to prevent loops", async () => {
  const transcriptPath = createTempTranscriptFile(
    `${JSON.stringify({
      session_id: "sess_transcript_loop_guard",
      event: "assistant_response",
      timestamp: "2026-02-23T10:10:01.000Z"
    })}\n`
  );
  const sink = new RecordingTranscriptSink();
  const processor = createTranscriptIngestionProcessor({
    sink
  });

  await processor.processAcceptedEvent(
    createTranscriptTriggerEvent(transcriptPath, {
      source: "transcript"
    })
  );

  assert.equal(sink.ingestedBatches.length, 0);
  fs.rmSync(path.dirname(transcriptPath), { recursive: true, force: true });
});

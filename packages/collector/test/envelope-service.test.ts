import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { EventEnvelope } from "../../schema/src/types";
import { createEnvelopeCollectorService } from "../src";
import type { CollectorEnvelopeEvent, CollectorEnvelopePayload, TranscriptEventPayload } from "../src/types";

function createEnvelope(
  overrides: Partial<CollectorEnvelopeEvent> = {}
): CollectorEnvelopeEvent {
  return {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: "evt_envelope_service_001",
    sessionId: "sess_envelope_service_001",
    eventType: "tool_result",
    eventTimestamp: "2026-02-23T10:10:00.000Z",
    ingestedAt: "2026-02-23T10:10:01.000Z",
    privacyTier: 1,
    payload: {},
    ...overrides
  };
}

function createTempTranscriptFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-envelope-service-test-"));
  const filePath = path.join(dir, "session.jsonl");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });
}

test("envelope collector service validates and ingests hook envelopes", async () => {
  const service = createEnvelopeCollectorService();
  const response = service.handleRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(createEnvelope())
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.payload.status, "accepted");
  await flushAsyncWork();

  const stats = service.store.getStats();
  assert.equal(stats.storedEvents, 1);
  assert.equal(stats.dedupedEvents, 0);
  assert.equal(service.getProcessingStats().acceptedEvents, 1);
});

test("envelope collector service ingests parsed transcript events by default", async () => {
  const transcriptPath = createTempTranscriptFile(
    `${JSON.stringify({
      session_id: "sess_envelope_service_transcript",
      event: "assistant_response",
      timestamp: "2026-02-23T10:10:02.000Z"
    })}\n`
  );
  const service = createEnvelopeCollectorService();

  const response = service.handleRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(
      createEnvelope({
        eventId: "evt_envelope_service_session_end",
        sessionId: "sess_envelope_service_transcript",
        eventType: "session_end",
        payload: {
          transcript_path: transcriptPath
        } as CollectorEnvelopePayload
      })
    )
  });

  assert.equal(response.statusCode, 202);
  await flushAsyncWork();

  const stats = service.store.getStats();
  assert.equal(stats.storedEvents, 2);
  assert.equal(stats.dedupedEvents, 0);
  assert.equal(service.getProcessingStats().acceptedEvents, 2);

  fs.rmSync(path.dirname(transcriptPath), { recursive: true, force: true });
});

test("envelope collector otel sink ingests normalized envelope events", async () => {
  const service = createEnvelopeCollectorService({
    enableTranscriptIngestion: false
  });
  const otelEnvelope = createEnvelope({
    source: "otel",
    sourceVersion: "claude-code-otel-v1",
    eventId: "evt_envelope_service_otel_001",
    sessionId: "sess_envelope_service_otel",
    payload: {
      model: "claude-sonnet-4"
    }
  }) as EventEnvelope<TranscriptEventPayload>;

  await service.otelSink.ingestOtelEvents([otelEnvelope]);
  await flushAsyncWork();

  const stats = service.store.getStats();
  assert.equal(stats.storedEvents, 1);
  assert.equal(stats.dedupedEvents, 0);
  assert.equal(service.getProcessingStats().acceptedEvents, 1);
});

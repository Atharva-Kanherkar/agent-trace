import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createCollectorService,
  normalizeOtelExport,
  processOtelExportPayload,
  startStandaloneCollector,
  createTranscriptIngestionProcessor,
  handleCollectorRawHttpRequest,
  handleCollectorRequest,
  InMemoryCollectorStore,
  parseTranscriptJsonl
} from "../src";
import { createSampleCollectorEvent, type SampleCollectorEvent } from "../src/samples";
import type {
  CollectorHandlerDependencies,
  CollectorValidationResult,
  TranscriptEventPayload,
  TranscriptIngestionSink,
  OtelEventsSink
} from "../src/types";
import type { EventEnvelope } from "../../schema/src/types";

function createDependencies(
  store: InMemoryCollectorStore<SampleCollectorEvent>
): CollectorHandlerDependencies<SampleCollectorEvent> {
  return {
    startedAtMs: Date.now() - 1000,
    validateEvent: (input: unknown): CollectorValidationResult<SampleCollectorEvent> => {
      if (typeof input !== "object" || input === null) {
        return {
          ok: false,
          value: undefined,
          errors: ["event: must be an object"]
        };
      }

      const record = input as Record<string, unknown>;
      const eventId = record["eventId"];
      const sessionId = record["sessionId"];
      const eventType = record["eventType"];

      if (
        typeof eventId !== "string" ||
        typeof sessionId !== "string" ||
        typeof eventType !== "string" ||
        eventId.length === 0 ||
        sessionId.length === 0 ||
        eventType.length === 0
      ) {
        return {
          ok: false,
          value: undefined,
          errors: ["invalid event fields"]
        };
      }

      return {
        ok: true,
        value: {
          eventId,
          sessionId,
          eventType
        },
        errors: []
      };
    },
    getEventId: (event: SampleCollectorEvent): string => event.eventId,
    store
  };
}

async function main(): Promise<void> {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const dependencies = createDependencies(store);
  const event = createSampleCollectorEvent({
    eventId: "evt_manual_001",
    sessionId: "sess_manual_001"
  });

  const first = handleCollectorRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      body: event
    },
    dependencies
  );
  const duplicate = handleCollectorRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      body: event
    },
    dependencies
  );
  const stats = handleCollectorRequest(
    {
      method: "GET",
      url: "/v1/hooks/stats"
    },
    dependencies
  );
  const rawStats = handleCollectorRawHttpRequest(
    {
      method: "GET",
      url: "/v1/hooks/stats"
    },
    dependencies
  );

  if (
    first.statusCode !== 202 ||
    duplicate.statusCode !== 202 ||
    stats.statusCode !== 200 ||
    rawStats.statusCode !== 200
  ) {
    throw new Error("collector smoke failed: unexpected response status");
  }
  if (first.payload.status !== "accepted" || duplicate.payload.status !== "accepted") {
    throw new Error("collector smoke failed: expected accepted payload");
  }
  if (stats.payload.status !== "ok" || !("stats" in stats.payload)) {
    throw new Error("collector smoke failed: expected stats payload");
  }
  if (stats.payload.stats.storedEvents !== 1 || stats.payload.stats.dedupedEvents !== 1) {
    throw new Error("collector smoke failed: unexpected stats counters");
  }

  const service = createCollectorService({
    dependencies: createDependencies(new InMemoryCollectorStore<SampleCollectorEvent>()),
    processor: {
      processAcceptedEvent: async (): Promise<void> => {
        // no-op smoke processor
      }
    }
  });
  const serviceResponse = service.handleRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: JSON.stringify(
      createSampleCollectorEvent({
        eventId: "evt_manual_service_001"
      })
    )
  });
  if (serviceResponse.statusCode !== 202) {
    throw new Error("collector smoke failed: expected service ingest to be accepted");
  }

  const transcriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-collector-smoke-"));
  const transcriptPath = path.join(transcriptDir, "session.jsonl");
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({
      session_id: "sess_manual_001",
      event: "assistant_response",
      timestamp: "2026-02-23T10:00:00.000Z"
    })}\n`,
    "utf8"
  );
  const transcriptParse = parseTranscriptJsonl({
    filePath: transcriptPath,
    privacyTier: 1,
    ingestedAt: "2026-02-23T10:01:00.000Z"
  });
  fs.rmSync(transcriptDir, { recursive: true, force: true });

  if (!transcriptParse.ok || transcriptParse.parsedEvents.length !== 1) {
    throw new Error("collector smoke failed: transcript parser did not produce expected event");
  }

  const otelNormalized = normalizeOtelExport({
    privacyTier: 1,
    ingestedAt: "2026-02-23T10:01:00.000Z",
    payload: {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    {
                      key: "session_id",
                      value: { stringValue: "sess_manual_001" }
                    },
                    {
                      key: "event_type",
                      value: { stringValue: "tool_result" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  });
  if (!otelNormalized.ok || otelNormalized.events.length !== 1) {
    throw new Error("collector smoke failed: otel normalizer did not produce expected event");
  }
  const otelSinkBatches: number[] = [];
  const otelSink: OtelEventsSink = {
    ingestOtelEvents: async (events): Promise<void> => {
      otelSinkBatches.push(events.length);
    }
  };
  const otelProcessed = await processOtelExportPayload(
    {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    {
                      key: "session_id",
                      value: { stringValue: "sess_manual_001" }
                    },
                    {
                      key: "event_type",
                      value: { stringValue: "tool_result" }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      privacyTier: 1,
      sink: otelSink
    }
  );
  if (otelProcessed.normalizedEvents !== 1 || otelProcessed.sinkFailed) {
    throw new Error("collector smoke failed: otel export processing did not complete as expected");
  }

  const transcriptIngestionBatches: Array<readonly EventEnvelope<TranscriptEventPayload>[]> = [];
  const transcriptSink: TranscriptIngestionSink = {
    ingestTranscriptEvents: async (events: readonly EventEnvelope<TranscriptEventPayload>[]): Promise<void> => {
      transcriptIngestionBatches.push(events);
    }
  };
  const transcriptProcessor = createTranscriptIngestionProcessor({
    sink: transcriptSink
  });
  const transcriptDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-collector-smoke-ingest-"));
  const transcriptPath2 = path.join(transcriptDir2, "session.jsonl");
  fs.writeFileSync(
    transcriptPath2,
    `${JSON.stringify({
      session_id: "sess_manual_001",
      event: "assistant_response",
      timestamp: "2026-02-23T10:00:00.000Z"
    })}\n`,
    "utf8"
  );
  await transcriptProcessor.processAcceptedEvent({
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: "evt_manual_transcript_ingest",
    sessionId: "sess_manual_001",
    eventType: "session_end",
    eventTimestamp: "2026-02-23T10:10:00.000Z",
    ingestedAt: "2026-02-23T10:10:01.000Z",
    privacyTier: 1,
    payload: {
      transcript_path: transcriptPath2
    }
  });
  if (transcriptIngestionBatches.length !== 1 || transcriptIngestionBatches[0]?.length !== 1) {
    throw new Error("collector smoke failed: transcript ingestion processor did not forward parsed events");
  }
  fs.rmSync(transcriptDir2, { recursive: true, force: true });

  const standaloneCollector = await startStandaloneCollector({
    host: "127.0.0.1",
    httpPort: 0,
    otelGrpcAddress: "127.0.0.1:0",
    enableTranscriptIngestion: false
  });
  try {
    const standaloneHealth = await fetch(`http://${standaloneCollector.httpAddress}/health`);
    if (standaloneHealth.status !== 200) {
      throw new Error("collector smoke failed: standalone collector health check failed");
    }
  } finally {
    await standaloneCollector.close();
  }

  console.log("collector manual smoke passed");
  console.log(`storedEvents=${stats.payload.stats.storedEvents}`);
  console.log(`dedupedEvents=${stats.payload.stats.dedupedEvents}`);
  console.log(`serviceAcceptedEvents=${service.getProcessingStats().acceptedEvents}`);
  console.log(`transcriptParsedEvents=${transcriptParse.parsedEvents.length}`);
  console.log(`transcriptIngestionBatches=${transcriptIngestionBatches.length}`);
  console.log(`otelNormalizedEvents=${otelNormalized.events.length}`);
  console.log(`otelProcessedEvents=${otelProcessed.normalizedEvents}`);
  console.log(`otelSinkBatches=${otelSinkBatches.length}`);
  console.log("standaloneCollectorHealth=ok");
}

void main();

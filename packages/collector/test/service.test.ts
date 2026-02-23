import assert from "node:assert/strict";
import test from "node:test";

import { createCollectorService, InMemoryCollectorStore } from "../src";
import type {
  CollectorAcceptedEventProcessor,
  CollectorHandlerDependencies,
  CollectorValidationResult
} from "../src";
import type { SampleCollectorEvent } from "../src/samples";

function createValidationSuccess(event: SampleCollectorEvent): CollectorValidationResult<SampleCollectorEvent> {
  return {
    ok: true,
    value: event,
    errors: []
  };
}

function createDependencies(
  store: InMemoryCollectorStore<SampleCollectorEvent>
): CollectorHandlerDependencies<SampleCollectorEvent> {
  return {
    startedAtMs: Date.now() - 5000,
    validateEvent: (input: unknown): CollectorValidationResult<SampleCollectorEvent> => {
      if (typeof input !== "object" || input === null) {
        return {
          ok: false,
          value: undefined,
          errors: ["event must be object"]
        };
      }

      const record = input as Record<string, unknown>;
      const eventId = record["eventId"];
      const sessionId = record["sessionId"];
      const eventType = record["eventType"];

      if (
        typeof eventId !== "string" ||
        eventId.length === 0 ||
        typeof sessionId !== "string" ||
        sessionId.length === 0 ||
        typeof eventType !== "string" ||
        eventType.length === 0
      ) {
        return {
          ok: false,
          value: undefined,
          errors: ["invalid event fields"]
        };
      }

      return createValidationSuccess({
        eventId,
        sessionId,
        eventType
      });
    },
    getEventId: (event: SampleCollectorEvent): string => event.eventId,
    store
  };
}

function createRawEvent(eventId: string): string {
  return JSON.stringify({
    eventId,
    sessionId: "sess_service_001",
    eventType: "tool_result"
  });
}

test("collector service invokes accepted event processor and tracks accepted count", async () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const processed: string[] = [];
  const processor: CollectorAcceptedEventProcessor<SampleCollectorEvent> = {
    processAcceptedEvent: async (event: SampleCollectorEvent): Promise<void> => {
      processed.push(event.eventId);
    }
  };

  const service = createCollectorService({
    dependencies: createDependencies(store),
    processor
  });

  const response = service.handleRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: createRawEvent("evt_service_001")
  });
  assert.equal(response.statusCode, 202);

  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });

  assert.deepEqual(processed, ["evt_service_001"]);
  const stats = service.getProcessingStats();
  assert.equal(stats.acceptedEvents, 1);
  assert.equal(stats.processingFailures, 0);
});

test("collector service does not process deduped events", async () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const processed: string[] = [];
  const service = createCollectorService({
    dependencies: createDependencies(store),
    processor: {
      processAcceptedEvent: async (event: SampleCollectorEvent): Promise<void> => {
        processed.push(event.eventId);
      }
    }
  });

  service.handleRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: createRawEvent("evt_service_dupe")
  });
  service.handleRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: createRawEvent("evt_service_dupe")
  });

  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });

  assert.deepEqual(processed, ["evt_service_dupe"]);
  const stats = service.getProcessingStats();
  assert.equal(stats.acceptedEvents, 1);
  assert.equal(stats.processingFailures, 0);
});

test("collector service tracks processor failures without breaking ingest response", async () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const service = createCollectorService({
    dependencies: createDependencies(store),
    processor: {
      processAcceptedEvent: async (): Promise<void> => {
        throw new Error("processor failed");
      }
    }
  });

  const response = service.handleRaw({
    method: "POST",
    url: "/v1/hooks",
    rawBody: createRawEvent("evt_service_failure")
  });

  assert.equal(response.statusCode, 202);
  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });

  const stats = service.getProcessingStats();
  assert.equal(stats.acceptedEvents, 1);
  assert.equal(stats.processingFailures, 1);
  assert.equal(stats.lastProcessingFailure?.includes("processor failed"), true);
});

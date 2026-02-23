import { handleCollectorRequest, InMemoryCollectorStore } from "../src";
import { createSampleCollectorEvent, type SampleCollectorEvent } from "../src/samples";
import type { CollectorHandlerDependencies, CollectorValidationResult } from "../src/types";

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

function main(): void {
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

  if (first.statusCode !== 202 || duplicate.statusCode !== 202 || stats.statusCode !== 200) {
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

  console.log("collector manual smoke passed");
  console.log(`storedEvents=${stats.payload.stats.storedEvents}`);
  console.log(`dedupedEvents=${stats.payload.stats.dedupedEvents}`);
}

main();

import assert from "node:assert/strict";
import test from "node:test";

import { handleCollectorRequest, InMemoryCollectorStore } from "../src";
import type { CollectorHandlerDependencies, CollectorValidationResult } from "../src";
import { createSampleCollectorEvent, type SampleCollectorEvent } from "../src/samples";

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
          errors: ["event: must be an object"]
        };
      }

      const maybeRecord = input as Record<string, unknown>;
      const eventId = maybeRecord["eventId"];
      const sessionId = maybeRecord["sessionId"];
      const eventType = maybeRecord["eventType"];

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
          errors: ["event fields are invalid"]
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

test("returns health response", () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const response = handleCollectorRequest(
    {
      method: "GET",
      url: "/health"
    },
    createDependencies(store)
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.status, "ok");
});

test("accepts valid hook event and deduplicates duplicate ids", () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const dependencies = createDependencies(store);

  const first = handleCollectorRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      body: createSampleCollectorEvent()
    },
    dependencies
  );
  assert.equal(first.statusCode, 202);
  if (first.payload.status === "accepted") {
    assert.equal(first.payload.accepted, true);
    assert.equal(first.payload.deduped, false);
  } else {
    assert.fail("expected accepted payload");
  }

  const duplicate = handleCollectorRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      body: createSampleCollectorEvent()
    },
    dependencies
  );
  assert.equal(duplicate.statusCode, 202);
  if (duplicate.payload.status === "accepted") {
    assert.equal(duplicate.payload.accepted, false);
    assert.equal(duplicate.payload.deduped, true);
  } else {
    assert.fail("expected accepted payload");
  }

  const stats = handleCollectorRequest(
    {
      method: "GET",
      url: "/v1/hooks/stats"
    },
    dependencies
  );
  assert.equal(stats.statusCode, 200);
  if (stats.payload.status === "ok" && "stats" in stats.payload) {
    assert.equal(stats.payload.stats.storedEvents, 1);
    assert.equal(stats.payload.stats.dedupedEvents, 1);
  } else {
    assert.fail("expected stats payload");
  }
});

test("returns validation errors for invalid hook payload", () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const response = handleCollectorRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      body: {
        eventId: ""
      }
    },
    createDependencies(store)
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.status, "error");
  if (response.payload.status === "error") {
    assert.ok(Array.isArray(response.payload.errors));
  }
});

test("returns 404 for unknown route", () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const response = handleCollectorRequest(
    {
      method: "GET",
      url: "/v1/unknown"
    },
    createDependencies(store)
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.payload.status, "error");
  if (response.payload.status === "error") {
    assert.equal(response.payload.message, "not found");
  }
});

test("swallows async onAcceptedEvent failures and still accepts ingest", async () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const dependencies: CollectorHandlerDependencies<SampleCollectorEvent> = {
    ...createDependencies(store),
    onAcceptedEvent: async (): Promise<void> => {
      throw new Error("persistence failed");
    }
  };

  const response = handleCollectorRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      body: createSampleCollectorEvent({
        eventId: "evt_async_failure"
      })
    },
    dependencies
  );

  assert.equal(response.statusCode, 202);
  assert.equal(response.payload.status, "accepted");
  if (response.payload.status === "accepted") {
    assert.equal(response.payload.accepted, true);
    assert.equal(response.payload.deduped, false);
  }

  await new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });
});

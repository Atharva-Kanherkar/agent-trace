import assert from "node:assert/strict";
import test from "node:test";

import { createSampleCollectorEvent } from "../src";
import { handleCollectorRawHttpRequest, InMemoryCollectorStore } from "../src";
import type { CollectorHandlerDependencies, CollectorValidationResult } from "../src";
import type { SampleCollectorEvent } from "../src/samples";

function createDependencies(
  store: InMemoryCollectorStore<SampleCollectorEvent>
): CollectorHandlerDependencies<SampleCollectorEvent> {
  return {
    startedAtMs: Date.now() - 2000,
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
          errors: ["event fields are invalid"]
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

test("raw HTTP adapter accepts valid POST json body", () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const response = handleCollectorRawHttpRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      rawBody: JSON.stringify(createSampleCollectorEvent())
    },
    createDependencies(store)
  );

  assert.equal(response.statusCode, 202);
  assert.equal(response.payload.status, "accepted");
  if (response.payload.status === "accepted") {
    assert.equal(response.payload.accepted, true);
    assert.equal(response.payload.deduped, false);
  }
});

test("raw HTTP adapter rejects invalid JSON body", () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const response = handleCollectorRawHttpRequest(
    {
      method: "POST",
      url: "/v1/hooks",
      rawBody: "{this is invalid}"
    },
    createDependencies(store)
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.status, "error");
  if (response.payload.status === "error") {
    assert.equal(response.payload.message, "invalid JSON body");
  }
});

test("raw HTTP adapter returns 405 for unsupported method", () => {
  const store = new InMemoryCollectorStore<SampleCollectorEvent>();
  const response = handleCollectorRawHttpRequest(
    {
      method: "DELETE",
      url: "/v1/hooks"
    },
    createDependencies(store)
  );

  assert.equal(response.statusCode, 405);
  assert.equal(response.payload.status, "error");
});


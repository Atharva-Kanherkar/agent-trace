import assert from "node:assert/strict";
import test from "node:test";

import { createSampleEvent, validateEventEnvelope } from "../src";

test("validateEventEnvelope accepts a valid event envelope", () => {
  const event = createSampleEvent();
  const result = validateEventEnvelope(event);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.eventId, "evt_001");
    assert.equal(result.errors.length, 0);
  }
});

test("validateEventEnvelope rejects invalid privacy tier and source", () => {
  const malformedEvent = {
    ...createSampleEvent(),
    source: "invalid_source",
    privacyTier: 9
  };

  const result = validateEventEnvelope(malformedEvent);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("source")));
    assert.ok(result.errors.some((error) => error.includes("privacyTier")));
  }
});

test("validateEventEnvelope rejects empty required fields", () => {
  const malformedEvent = {
    ...createSampleEvent(),
    eventId: "",
    sessionId: " ",
    eventTimestamp: "not-a-date"
  };

  const result = validateEventEnvelope(malformedEvent);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("eventId")));
    assert.ok(result.errors.some((error) => error.includes("sessionId")));
    assert.ok(result.errors.some((error) => error.includes("eventTimestamp")));
  }
});


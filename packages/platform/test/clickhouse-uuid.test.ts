import assert from "node:assert/strict";
import test from "node:test";

import { toDeterministicUuid } from "../src/clickhouse-uuid";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("toDeterministicUuid is stable for the same input", () => {
  const first = toDeterministicUuid("evt_runtime_001");
  const second = toDeterministicUuid("evt_runtime_001");
  assert.equal(first, second);
});

test("toDeterministicUuid produces valid UUIDv5-formatted values", () => {
  const value = toDeterministicUuid("evt_runtime_002");
  assert.match(value, UUID_PATTERN);
});

test("toDeterministicUuid changes when input changes", () => {
  const a = toDeterministicUuid("evt_a");
  const b = toDeterministicUuid("evt_b");
  assert.notEqual(a, b);
});

import assert from "node:assert/strict";
import test from "node:test";

import { toClickHouseDateTime64 } from "../src/clickhouse-datetime";

test("toClickHouseDateTime64 formats ISO string into ClickHouse DateTime64 UTC", () => {
  const formatted = toClickHouseDateTime64("2026-02-23T10:00:00.123Z");
  assert.equal(formatted, "2026-02-23 10:00:00.123");
});

test("toClickHouseDateTime64 normalizes timezone offsets into UTC", () => {
  const formatted = toClickHouseDateTime64("2026-02-23T15:30:00.000+05:30");
  assert.equal(formatted, "2026-02-23 10:00:00.000");
});

test("toClickHouseDateTime64 throws for invalid values", () => {
  assert.throws(() => toClickHouseDateTime64("not-a-date"), /Invalid date-time value/);
});

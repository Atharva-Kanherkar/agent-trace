import assert from "node:assert/strict";
import test from "node:test";

import { summarizeCost } from "../src";
import { createDashboardSampleTrace } from "../src/samples";

test("summarizeCost returns zeros for empty trace list", () => {
  const summary = summarizeCost([]);
  assert.equal(summary.totalCostUsd, 0);
  assert.equal(summary.averageCostUsd, 0);
  assert.equal(summary.highestCostSessionId, null);
});

test("summarizeCost computes total/avg/highest-cost-session", () => {
  const traceA = createDashboardSampleTrace({
    sessionId: "sess_a",
    metrics: {
      ...createDashboardSampleTrace().metrics,
      totalCostUsd: 0.5
    }
  });
  const traceB = createDashboardSampleTrace({
    sessionId: "sess_b",
    metrics: {
      ...createDashboardSampleTrace().metrics,
      totalCostUsd: 1.75
    }
  });

  const summary = summarizeCost([traceA, traceB]);
  assert.equal(summary.totalCostUsd, 2.25);
  assert.equal(summary.averageCostUsd, 1.125);
  assert.equal(summary.highestCostSessionId, "sess_b");
});


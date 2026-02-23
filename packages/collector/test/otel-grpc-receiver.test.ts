import assert from "node:assert/strict";
import test from "node:test";

import { processOtelExportPayload } from "../src";
import type { OtelEventsSink } from "../src/types";

const VALID_OTEL_PAYLOAD = {
  resourceLogs: [
    {
      scopeLogs: [
        {
          logRecords: [
            {
              attributes: [
                {
                  key: "session_id",
                  value: { stringValue: "sess_otel_receiver_001" }
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
};

test("processOtelExportPayload forwards normalized events to sink", async () => {
  const batches: number[] = [];
  const sink: OtelEventsSink = {
    ingestOtelEvents: async (events): Promise<void> => {
      batches.push(events.length);
    }
  };

  const result = await processOtelExportPayload(VALID_OTEL_PAYLOAD, {
    privacyTier: 1,
    sink
  });

  assert.equal(result.normalizedEvents, 1);
  assert.equal(result.droppedRecords, 0);
  assert.equal(result.normalizationFailed, false);
  assert.equal(result.sinkFailed, false);
  assert.deepEqual(batches, [1]);
});

test("processOtelExportPayload reports normalization failures", async () => {
  const normalizeErrors: string[] = [];

  const result = await processOtelExportPayload({}, {
    privacyTier: 1,
    onNormalizationErrors: (errors: readonly string[]): void => {
      normalizeErrors.push(...errors);
    }
  });

  assert.equal(result.normalizationFailed, true);
  assert.equal(result.normalizedEvents, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(normalizeErrors.length, 1);
});

test("processOtelExportPayload reports sink failures without dropping normalized result", async () => {
  const sink: OtelEventsSink = {
    ingestOtelEvents: async (): Promise<void> => {
      throw new Error("sink write failed");
    }
  };

  const result = await processOtelExportPayload(VALID_OTEL_PAYLOAD, {
    privacyTier: 1,
    sink
  });

  assert.equal(result.normalizedEvents, 1);
  assert.equal(result.sinkFailed, true);
  assert.equal(result.errors.some((entry) => entry.includes("sink write failed")), true);
});

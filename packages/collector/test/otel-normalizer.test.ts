import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOtelExport } from "../src";

test("normalizeOtelExport converts otlp log records into event envelopes", () => {
  const result = normalizeOtelExport({
    privacyTier: 1,
    ingestedAt: "2026-02-23T10:01:00.000Z",
    payload: {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1771840860000000000",
                  severityText: "INFO",
                  attributes: [
                    {
                      key: "session_id",
                      value: { stringValue: "sess_otel_001" }
                    },
                    {
                      key: "prompt_id",
                      value: { stringValue: "prompt_otel_001" }
                    },
                    {
                      key: "event_type",
                      value: { stringValue: "tool_result" }
                    },
                    {
                      key: "tool_name",
                      value: { stringValue: "Read" }
                    }
                  ],
                  body: {
                    stringValue: "tool finished"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.droppedRecords, 0);
  assert.equal(result.events[0]?.source, "otel");
  assert.equal(result.events[0]?.sessionId, "sess_otel_001");
  assert.equal(result.events[0]?.promptId, "prompt_otel_001");
  assert.equal(result.events[0]?.eventType, "tool_result");
  assert.equal(result.events[0]?.payload["tool_name"], "Read");
});

test("normalizeOtelExport returns failure when payload has no resource logs", () => {
  const result = normalizeOtelExport({
    privacyTier: 1,
    payload: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.events.length, 0);
  assert.equal(result.errors[0], "payload does not contain OTEL log records");
});

test("normalizeOtelExport keeps valid records and reports invalid records", () => {
  const result = normalizeOtelExport({
    privacyTier: 2,
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
                      value: { stringValue: "sess_otel_002" }
                    },
                    {
                      key: "event_type",
                      value: { stringValue: "api_request" }
                    }
                  ]
                },
                "invalid record"
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.events.length, 1);
  assert.equal(result.droppedRecords, 1);
  assert.equal(result.errors.length, 1);
});

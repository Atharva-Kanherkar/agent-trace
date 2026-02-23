import assert from "node:assert/strict";
import test from "node:test";

import { createSampleTrace, validateSessionTrace } from "../src";

test("validateSessionTrace accepts a valid session trace", () => {
  const trace = createSampleTrace();
  const result = validateSessionTrace(trace);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.sessionId, "sess_001");
    assert.equal(result.value.timeline.length, 1);
  }
});

test("validateSessionTrace rejects invalid metrics and timeline", () => {
  const trace = createSampleTrace({
    timeline: [
      {
        id: "",
        type: "tool_result",
        timestamp: "invalid"
      }
    ],
    metrics: {
      ...createSampleTrace().metrics,
      promptCount: -1,
      filesTouched: ["README.md", ""]
    }
  });

  const result = validateSessionTrace(trace);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("timeline[0].id")));
    assert.ok(result.errors.some((error) => error.includes("timeline[0].timestamp")));
    assert.ok(result.errors.some((error) => error.includes("metrics.promptCount")));
    assert.ok(result.errors.some((error) => error.includes("metrics.filesTouched[1]")));
  }
});

test("validateSessionTrace rejects malformed git pull request data", () => {
  const trace = createSampleTrace({
    git: {
      ...createSampleTrace().git,
      pullRequests: [
        {
          repo: "",
          prNumber: 0,
          state: ""
        }
      ]
    }
  });

  const result = validateSessionTrace(trace);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("git.pullRequests[0].repo")));
    assert.ok(result.errors.some((error) => error.includes("git.pullRequests[0].prNumber")));
    assert.ok(result.errors.some((error) => error.includes("git.pullRequests[0].state")));
  }
});


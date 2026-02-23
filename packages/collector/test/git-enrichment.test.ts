import assert from "node:assert/strict";
import test from "node:test";

import { enrichCollectorEventWithGitMetadata } from "../src/git-enrichment";
import type { CollectorEnvelopeEvent } from "../src/types";

function createEvent(overrides: Partial<CollectorEnvelopeEvent> = {}): CollectorEnvelopeEvent {
  return {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: "evt_git_enrichment_001",
    sessionId: "sess_git_enrichment_001",
    eventType: "tool_result",
    eventTimestamp: "2026-02-23T10:00:00.000Z",
    ingestedAt: "2026-02-23T10:00:01.000Z",
    privacyTier: 1,
    payload: {
      tool_name: "Bash",
      command: "git commit -m \"feat: add collector\"",
      stdout: "[main a1b2c3d] feat: add collector\n 1 file changed"
    },
    ...overrides
  };
}

test("enrichCollectorEventWithGitMetadata infers commit sha and message from bash git commit", () => {
  const enriched = enrichCollectorEventWithGitMetadata(createEvent());

  const payload = enriched.payload as Record<string, unknown>;
  assert.equal(payload["commit_sha"], "a1b2c3d");
  assert.equal(payload["commit_message"], "feat: add collector");
  assert.equal(enriched.attributes?.["git_enriched"], "1");
});

test("enrichCollectorEventWithGitMetadata infers branch from git checkout command", () => {
  const enriched = enrichCollectorEventWithGitMetadata(
    createEvent({
      payload: {
        tool_name: "Bash",
        command: "git checkout -b feature/trace-dashboard"
      }
    })
  );

  const payload = enriched.payload as Record<string, unknown>;
  assert.equal(payload["git_branch"], "feature/trace-dashboard");
  assert.equal(enriched.attributes?.["git_enriched"], "1");
});

test("enrichCollectorEventWithGitMetadata does not override existing git metadata", () => {
  const event = createEvent({
    payload: {
      tool_name: "Bash",
      command: "git commit -m \"feat: add collector\"",
      commit_sha: "existing_sha"
    }
  });
  const enriched = enrichCollectorEventWithGitMetadata(event);

  assert.equal(enriched, event);
});

test("enrichCollectorEventWithGitMetadata ignores non-hook or non-bash events", () => {
  const nonHook = createEvent({
    source: "otel"
  });
  const nonBash = createEvent({
    payload: {
      tool_name: "Read",
      command: "git commit -m \"feat: add collector\""
    }
  });

  assert.equal(enrichCollectorEventWithGitMetadata(nonHook), nonHook);
  assert.equal(enrichCollectorEventWithGitMetadata(nonBash), nonBash);
});

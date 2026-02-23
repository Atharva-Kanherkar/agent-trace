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
  assert.equal(payload["lines_added"], undefined);
  assert.equal(payload["lines_removed"], undefined);
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

test("enrichCollectorEventWithGitMetadata preserves existing git metadata while enriching missing fields", () => {
  const event = createEvent({
    payload: {
      tool_name: "Bash",
      command: "git commit -m \"feat: add collector\"",
      commit_sha: "existing_sha",
      stdout: "[main a1b2c3d] feat: add collector\n 2 files changed, 11 insertions(+), 3 deletions(-)"
    }
  });
  const enriched = enrichCollectorEventWithGitMetadata(event);
  const payload = enriched.payload as Record<string, unknown>;

  assert.equal(payload["commit_sha"], "existing_sha");
  assert.equal(payload["commit_message"], "feat: add collector");
  assert.equal(payload["lines_added"], 11);
  assert.equal(payload["lines_removed"], 3);
  assert.equal(enriched.attributes?.["git_enriched"], "1");
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

test("enrichCollectorEventWithGitMetadata extracts line stats from git commit shortstat output", () => {
  const enriched = enrichCollectorEventWithGitMetadata(
    createEvent({
      payload: {
        tool_name: "Bash",
        command: "git commit -m \"feat: improve parser\"",
        stdout: "[main b2c3d4e] feat: improve parser\n 5 files changed, 24 insertions(+), 9 deletions(-)"
      }
    })
  );

  const payload = enriched.payload as Record<string, unknown>;
  assert.equal(payload["commit_sha"], "b2c3d4e");
  assert.equal(payload["lines_added"], 24);
  assert.equal(payload["lines_removed"], 9);
});

test("enrichCollectorEventWithGitMetadata extracts files and totals from git diff numstat output", () => {
  const enriched = enrichCollectorEventWithGitMetadata(
    createEvent({
      payload: {
        tool_name: "Bash",
        command: "git diff --numstat",
        stdout: "10\t2\tsrc/collector.ts\n3\t0\tREADME.md\n-\t-\tassets/logo.png\n"
      }
    })
  );

  const payload = enriched.payload as Record<string, unknown>;
  assert.equal(payload["lines_added"], 13);
  assert.equal(payload["lines_removed"], 2);
  assert.deepEqual(payload["files_changed"], ["src/collector.ts", "README.md", "assets/logo.png"]);
});

test("enrichCollectorEventWithGitMetadata extracts files from git diff --name-only output", () => {
  const enriched = enrichCollectorEventWithGitMetadata(
    createEvent({
      payload: {
        tool_name: "Bash",
        command: "git diff --name-only",
        stdout: "src/http.ts\nsrc/git-enrichment.ts\n"
      }
    })
  );

  const payload = enriched.payload as Record<string, unknown>;
  assert.deepEqual(payload["files_changed"], ["src/http.ts", "src/git-enrichment.ts"]);
  assert.equal(enriched.attributes?.["git_enriched"], "1");
});

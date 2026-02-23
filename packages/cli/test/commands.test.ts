import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileCliConfigStore, parseArgs, runHookHandler, runHookHandlerAndForward, runInit, runStatus } from "../src";
import type { CollectorHttpClient, CollectorHttpPostResult } from "../src/types";

function createTempConfigDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-cli-test-"));
}

test("parseArgs parses supported command options", () => {
  const parsed = parseArgs([
    "node",
    "agent-trace",
    "init",
    "--config-dir",
    "/tmp/config-dir",
    "--collector-url",
    "http://127.0.0.1:8317/v1/hooks",
    "--privacy-tier",
    "2",
    "--no-install-hooks",
    "--forward"
  ]);

  assert.equal(parsed.command, "init");
  assert.equal(parsed.configDir, "/tmp/config-dir");
  assert.equal(parsed.collectorUrl, "http://127.0.0.1:8317/v1/hooks");
  assert.equal(parsed.privacyTier, 2);
  assert.equal(parsed.installHooks, false);
  assert.equal(parsed.forward, true);
});

test("runInit writes config and runStatus reports configured state", () => {
  const configDir = createTempConfigDir();
  const store = new FileCliConfigStore();

  const before = runStatus(configDir, store);
  assert.equal(before.ok, false);

  const initResult = runInit(
    {
      configDir,
      collectorUrl: "http://127.0.0.1:8317/v1/hooks",
      privacyTier: 3,
      nowIso: "2026-02-23T12:00:00.000Z"
    },
    store
  );

  assert.equal(initResult.ok, true);
  assert.equal(fs.existsSync(initResult.configPath), true);
  assert.equal(fs.existsSync(initResult.hooksPath), true);
  assert.equal(fs.existsSync(initResult.settingsPath), true);
  assert.equal(initResult.config.privacyTier, 3);
  assert.equal(initResult.config.hookCommand, "agent-trace hook-handler --forward");
  assert.equal(initResult.settingsHooksInstalled, true);
  assert.equal(initResult.hooks.hooks.length, 5);
  assert.equal(initResult.hooks.hooks[0]?.event, "SessionStart");

  const after = runStatus(configDir, store);
  assert.equal(after.ok, true);
  if (after.ok) {
    assert.equal(after.config.collectorUrl, "http://127.0.0.1:8317/v1/hooks");
    assert.equal(after.config.privacyTier, 3);
    assert.equal(after.hooksConfigured, true);
    assert.ok(after.hooksPath.endsWith("agent-trace-claude-hooks.json"));
    assert.equal(after.settingsHooksInstalled, true);
    assert.ok(after.settingsPath.endsWith("settings.local.json"));
  }

  fs.rmSync(configDir, { recursive: true, force: true });
});

test("runInit skips settings installation when installHooks=false", () => {
  const configDir = createTempConfigDir();
  const store = new FileCliConfigStore();

  const initResult = runInit(
    {
      configDir,
      installHooks: false,
      nowIso: "2026-02-23T12:00:00.000Z"
    },
    store
  );

  assert.equal(initResult.settingsHooksInstalled, false);
  assert.equal(fs.existsSync(initResult.settingsPath), false);

  const status = runStatus(configDir, store);
  assert.equal(status.ok, true);
  if (status.ok) {
    assert.equal(status.settingsHooksInstalled, false);
  }

  fs.rmSync(configDir, { recursive: true, force: true });
});

test("runHookHandler maps valid payload into event envelope", () => {
  const configDir = createTempConfigDir();
  const store = new FileCliConfigStore();
  runInit(
    {
      configDir,
      privacyTier: 2,
      nowIso: "2026-02-23T12:00:00.000Z"
    },
    store
  );

  const rawPayload = JSON.stringify({
    hook: "PostToolUse",
    event: "tool_result",
    session_id: "sess_001",
    prompt_id: "prompt_001",
    timestamp: "2026-02-23T12:00:01.000Z",
    tool_name: "Read"
  });

  const first = runHookHandler(
    {
      rawStdin: rawPayload,
      configDir,
      nowIso: "2026-02-23T12:00:02.000Z"
    },
    store
  );
  const second = runHookHandler(
    {
      rawStdin: rawPayload,
      configDir,
      nowIso: "2026-02-23T12:00:02.000Z"
    },
    store
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.envelope.source, "hook");
    assert.equal(first.envelope.sessionId, "sess_001");
    assert.equal(first.envelope.promptId, "prompt_001");
    assert.equal(first.envelope.privacyTier, 2);
    assert.equal(first.envelope.eventId.length, 64);
    assert.equal(first.envelope.eventId, second.envelope.eventId);
  }

  fs.rmSync(configDir, { recursive: true, force: true });
});

test("runHookHandler rejects invalid JSON and empty payload", () => {
  const invalidJson = runHookHandler({
    rawStdin: "{ this is invalid json "
  });
  assert.equal(invalidJson.ok, false);

  const emptyPayload = runHookHandler({
    rawStdin: "   "
  });
  assert.equal(emptyPayload.ok, false);
});

class MockCollectorClient implements CollectorHttpClient {
  public constructor(private readonly response: CollectorHttpPostResult) {}

  public async postJson(_url: string, _payload: unknown): Promise<CollectorHttpPostResult> {
    return this.response;
  }
}

test("runHookHandlerAndForward sends envelope to collector client", async () => {
  const configDir = createTempConfigDir();
  const store = new FileCliConfigStore();
  runInit(
    {
      configDir,
      collectorUrl: "http://collector.local/v1/hooks",
      privacyTier: 1,
      nowIso: "2026-02-23T12:00:00.000Z"
    },
    store
  );

  const result = await runHookHandlerAndForward(
    {
      rawStdin: JSON.stringify({
        event: "tool_result",
        session_id: "sess_123",
        prompt_id: "prompt_123",
        timestamp: "2026-02-23T12:00:01.000Z"
      }),
      configDir,
      nowIso: "2026-02-23T12:00:02.000Z"
    },
    new MockCollectorClient({
      ok: true,
      statusCode: 202,
      body: "{\"status\":\"accepted\"}"
    }),
    store
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.collectorUrl, "http://collector.local/v1/hooks");
    assert.equal(result.statusCode, 202);
  }

  fs.rmSync(configDir, { recursive: true, force: true });
});

test("runHookHandlerAndForward surfaces collector transport errors", async () => {
  const result = await runHookHandlerAndForward(
    {
      rawStdin: JSON.stringify({
        event: "tool_result",
        session_id: "sess_123"
      }),
      nowIso: "2026-02-23T12:00:02.000Z"
    },
    new MockCollectorClient({
      ok: false,
      statusCode: 0,
      body: "",
      error: "connection refused"
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("connection refused")));
  }
});

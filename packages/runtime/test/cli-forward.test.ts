import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileCliConfigStore, runHookHandlerAndForward, runInit } from "../../cli/src";
import type { CollectorHttpClient, CollectorHttpPostResult } from "../../cli/src/types";
import { createInMemoryRuntime } from "../src";

function createTempConfigDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-runtime-cli-"));
}

class RuntimeCollectorHttpClient implements CollectorHttpClient {
  public constructor(private readonly runtime: ReturnType<typeof createInMemoryRuntime>) {}

  public async postJson(url: string, payload: unknown): Promise<CollectorHttpPostResult> {
    const parsed = new URL(url, "http://127.0.0.1");
    const response = this.runtime.handleCollectorRaw({
      method: "POST",
      url: parsed.pathname,
      rawBody: JSON.stringify(payload)
    });

    return {
      ok: true,
      statusCode: response.statusCode,
      body: JSON.stringify(response.payload)
    };
  }
}

test("cli forward mode routes envelopes through runtime collector and updates session projection", async () => {
  const runtime = createInMemoryRuntime(Date.parse("2026-02-23T10:00:00.000Z"));
  const configDir = createTempConfigDir();
  const store = new FileCliConfigStore();

  try {
    const initResult = runInit(
      {
        configDir,
        collectorUrl: "http://runtime.local/v1/hooks",
        privacyTier: 1,
        nowIso: "2026-02-23T10:00:00.000Z"
      },
      store
    );
    assert.equal(initResult.ok, true);

    const forwardResult = await runHookHandlerAndForward(
      {
        rawStdin: JSON.stringify({
          hook: "PostToolUse",
          event: "tool_result",
          session_id: "sess_cli_runtime",
          prompt_id: "prompt_cli_runtime",
          timestamp: "2026-02-23T10:00:01.000Z",
          tool_name: "Read"
        }),
        configDir,
        nowIso: "2026-02-23T10:00:02.000Z"
      },
      new RuntimeCollectorHttpClient(runtime),
      store
    );

    assert.equal(forwardResult.ok, true);
    if (forwardResult.ok) {
      assert.equal(forwardResult.statusCode, 202);
    }

    const projected = runtime.sessionRepository.getBySessionId("sess_cli_runtime");
    assert.notEqual(projected, undefined);
    assert.equal(projected?.timeline.length, 1);
    assert.equal(projected?.metrics.toolCallCount, 1);
    assert.equal(projected?.metrics.promptCount, 0);

    const stats = runtime.collectorStore.getStats();
    assert.equal(stats.storedEvents, 1);
    assert.equal(stats.dedupedEvents, 0);
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});

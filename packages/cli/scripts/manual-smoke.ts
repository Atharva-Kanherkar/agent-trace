import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileCliConfigStore, runHookHandler, runInit, runStatus } from "../src";

function createTempConfigDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-cli-smoke-"));
}

function main(): void {
  const configDir = createTempConfigDir();
  const store = new FileCliConfigStore();

  const init = runInit(
    {
      configDir,
      collectorUrl: "http://127.0.0.1:8317/v1/hooks",
      privacyTier: 2,
      nowIso: "2026-02-23T13:00:00.000Z"
    },
    store
  );

  const status = runStatus(configDir, store);

  const hook = runHookHandler(
    {
      configDir,
      nowIso: "2026-02-23T13:00:01.000Z",
      rawStdin: JSON.stringify({
        hook: "SessionStart",
        event: "session_start",
        session_id: "sess_manual_001",
        prompt_id: "prompt_manual_001",
        timestamp: "2026-02-23T13:00:01.000Z"
      })
    },
    store
  );

  if (!init.ok) {
    throw new Error("cli smoke failed: init did not succeed");
  }
  if (!status.ok) {
    throw new Error("cli smoke failed: status did not find config");
  }
  if (!hook.ok) {
    throw new Error(`cli smoke failed: hook handler errors: ${hook.errors.join(" | ")}`);
  }

  console.log("cli manual smoke passed");
  console.log(`configPath=${init.configPath}`);
  console.log(`sessionId=${hook.envelope.sessionId}`);
  console.log(`eventType=${hook.envelope.eventType}`);

  fs.rmSync(configDir, { recursive: true, force: true });
}

main();


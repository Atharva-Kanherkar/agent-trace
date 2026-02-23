import {
  ClickHouseEventWriter,
  getMigrationManifest,
  validateMigrationManifest
} from "../src";
import type {
  ClickHouseAgentEventRow,
  ClickHouseInsertRequest,
  ClickHouseInsertClient,
  PlatformEventEnvelope
} from "../src/persistence-types";

class SmokeInsertClient implements ClickHouseInsertClient<ClickHouseAgentEventRow> {
  public lastRequest?: ClickHouseInsertRequest<ClickHouseAgentEventRow>;

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    this.lastRequest = request;
  }
}

async function main(): Promise<void> {
  const manifest = getMigrationManifest();
  const result = validateMigrationManifest(manifest);

  if (!result.ok) {
    throw new Error(`platform migration smoke failed: ${result.errors.join(" | ")}`);
  }

  const client = new SmokeInsertClient();
  const writer = new ClickHouseEventWriter(client);
  const event: PlatformEventEnvelope = {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: "evt_platform_smoke_001",
    sessionId: "sess_platform_smoke",
    eventType: "tool_result",
    eventTimestamp: "2026-02-23T10:00:00.000Z",
    ingestedAt: "2026-02-23T10:00:01.000Z",
    privacyTier: 1,
    payload: {
      user_id: "user_platform_smoke",
      tool_name: "Read",
      tool_success: true,
      files_changed: ["README.md"]
    },
    attributes: {
      smoke: "true"
    }
  };

  const writeSummary = await writer.writeEvent(event);
  if (writeSummary.writtenRows !== 1) {
    throw new Error("platform event writer smoke failed: expected one written row");
  }
  if (client.lastRequest === undefined) {
    throw new Error("platform event writer smoke failed: no insert request captured");
  }

  console.log("platform manual smoke passed");
  console.log(`checkedFiles=${result.checkedFiles}`);
  console.log(`writerRows=${writeSummary.writtenRows}`);
}

void main();

import {
  ClickHouseEventWriter,
  ClickHouseSessionTraceWriter,
  PostgresSessionWriter,
  PostgresSettingsWriter,
  getMigrationManifest,
  validateMigrationManifest
} from "../src";
import type {
  AgentSessionTrace
} from "../../schema/src/types";
import type {
  ClickHouseAgentEventRow,
  ClickHouseInsertRequest,
  ClickHouseInsertClient,
  ClickHouseSessionTraceRow,
  PlatformEventEnvelope,
  PostgresCommitRow,
  PostgresInstanceSettingRow,
  PostgresSessionPersistenceClient,
  PostgresSessionRow,
  PostgresSettingsPersistenceClient
} from "../src/persistence-types";

class SmokeInsertClient implements ClickHouseInsertClient<ClickHouseAgentEventRow> {
  public lastRequest?: ClickHouseInsertRequest<ClickHouseAgentEventRow>;

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseAgentEventRow>): Promise<void> {
    this.lastRequest = request;
  }
}

class SmokeSessionTraceInsertClient implements ClickHouseInsertClient<ClickHouseSessionTraceRow> {
  public lastRequest?: ClickHouseInsertRequest<ClickHouseSessionTraceRow>;

  public async insertJsonEachRow(request: ClickHouseInsertRequest<ClickHouseSessionTraceRow>): Promise<void> {
    this.lastRequest = request;
  }
}

class SmokePostgresSessionClient implements PostgresSessionPersistenceClient {
  public sessionRows: readonly PostgresSessionRow[] = [];
  public commitRows: readonly PostgresCommitRow[] = [];

  public async upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void> {
    this.sessionRows = rows;
  }

  public async upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void> {
    this.commitRows = rows;
  }
}

class SmokePostgresSettingsClient implements PostgresSettingsPersistenceClient {
  public settingsRows: readonly PostgresInstanceSettingRow[] = [];

  public async upsertInstanceSettings(rows: readonly PostgresInstanceSettingRow[]): Promise<void> {
    this.settingsRows = rows;
  }
}

function createManualTrace(): AgentSessionTrace {
  return {
    sessionId: "sess_pg_smoke_001",
    agentType: "claude_code",
    user: {
      id: "user_pg_smoke_001"
    },
    environment: {
      projectPath: "/home/atharva/agent-trace",
      gitRepo: "Atharva-Kanherkar/agent-trace",
      gitBranch: "main"
    },
    startedAt: "2026-02-23T10:00:00.000Z",
    endedAt: "2026-02-23T10:05:00.000Z",
    activeDurationMs: 300000,
    timeline: [],
    metrics: {
      promptCount: 0,
      apiCallCount: 0,
      toolCallCount: 0,
      totalCostUsd: 0.23,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      linesAdded: 0,
      linesRemoved: 0,
      filesTouched: [],
      modelsUsed: [],
      toolsUsed: []
    },
    git: {
      commits: [
        {
          sha: "sha_pg_smoke_001",
          promptId: "prompt_pg_smoke_001"
        }
      ],
      pullRequests: []
    }
  };
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

  const sessionClient = new SmokePostgresSessionClient();
  const sessionWriter = new PostgresSessionWriter(sessionClient);
  const trace = createManualTrace();

  const sessionTraceClient = new SmokeSessionTraceInsertClient();
  const sessionTraceWriter = new ClickHouseSessionTraceWriter(sessionTraceClient, {
    versionProvider: () => 99,
    updatedAtProvider: () => "2026-02-23T10:06:00.000Z"
  });
  const traceSummary = await sessionTraceWriter.writeTrace(trace);
  if (traceSummary.writtenRows !== 1) {
    throw new Error("platform session trace writer smoke failed: expected one written row");
  }
  if (sessionTraceClient.lastRequest === undefined) {
    throw new Error("platform session trace writer smoke failed: no insert request captured");
  }

  const sessionWriteSummary = await sessionWriter.writeTrace(trace);
  if (sessionWriteSummary.writtenSessions !== 1 || sessionWriteSummary.writtenCommits !== 1) {
    throw new Error("platform postgres session writer smoke failed: expected one session and one commit");
  }

  const settingsClient = new SmokePostgresSettingsClient();
  const settingsWriter = new PostgresSettingsWriter(settingsClient);
  const settingsSummary = await settingsWriter.writeSetting("privacy_tier", 1);
  if (settingsSummary.writtenSettings !== 1) {
    throw new Error("platform postgres settings writer smoke failed: expected one setting");
  }

  console.log("platform manual smoke passed");
  console.log(`checkedFiles=${result.checkedFiles}`);
  console.log(`writerRows=${writeSummary.writtenRows}`);
  console.log(`traceRows=${traceSummary.writtenRows}`);
  console.log(`pgSessionRows=${sessionWriteSummary.writtenSessions}`);
  console.log(`pgCommitRows=${sessionWriteSummary.writtenCommits}`);
  console.log(`pgSettingsRows=${settingsSummary.writtenSettings}`);
}

void main();

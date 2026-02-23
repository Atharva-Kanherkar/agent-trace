import type { AgentSessionTrace, CommitInfo } from "../../schema/src/types";
import type {
  JsonValue,
  PostgresCommitRow,
  PostgresInstanceSettingRow,
  PostgresSessionPersistenceClient,
  PostgresSessionRow,
  PostgresSessionWriterSummary,
  PostgresSettingsPersistenceClient,
  PostgresSettingsWriterSummary
} from "./persistence-types";

function toNullableString(value: string | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

function toNonNegativeInteger(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function toNonNegativeDecimal(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Number(value.toFixed(6));
}

function toSessionStatus(trace: AgentSessionTrace): "active" | "completed" {
  return trace.endedAt !== undefined ? "completed" : "active";
}

export function toPostgresSessionRow(trace: AgentSessionTrace): PostgresSessionRow {
  return {
    session_id: trace.sessionId,
    user_id: trace.user.id,
    started_at: trace.startedAt,
    ended_at: toNullableString(trace.endedAt),
    status: toSessionStatus(trace),
    project_path: toNullableString(trace.environment.projectPath),
    git_repo: toNullableString(trace.environment.gitRepo),
    git_branch: toNullableString(trace.environment.gitBranch)
  };
}

function toPostgresCommitRow(trace: AgentSessionTrace, commit: CommitInfo): PostgresCommitRow {
  return {
    sha: commit.sha,
    session_id: trace.sessionId,
    prompt_id: toNullableString(commit.promptId),
    message: toNullableString(commit.message),
    lines_added: toNonNegativeInteger(commit.linesAdded),
    lines_removed: toNonNegativeInteger(commit.linesRemoved),
    chain_cost_usd: 0,
    committed_at: toNullableString(commit.committedAt)
  };
}

export function toPostgresCommitRows(trace: AgentSessionTrace): readonly PostgresCommitRow[] {
  return trace.git.commits.map((commit) => toPostgresCommitRow(trace, commit));
}

function dedupeBySessionId(rows: readonly PostgresSessionRow[]): readonly PostgresSessionRow[] {
  const bySession = new Map<string, PostgresSessionRow>();
  rows.forEach((row) => {
    bySession.set(row.session_id, row);
  });
  return [...bySession.values()];
}

function dedupeBySha(rows: readonly PostgresCommitRow[]): readonly PostgresCommitRow[] {
  const bySha = new Map<string, PostgresCommitRow>();
  rows.forEach((row) => {
    bySha.set(row.sha, row);
  });
  return [...bySha.values()];
}

export class PostgresSessionWriter {
  private readonly client: PostgresSessionPersistenceClient;

  public constructor(client: PostgresSessionPersistenceClient) {
    this.client = client;
  }

  public async writeTrace(trace: AgentSessionTrace): Promise<PostgresSessionWriterSummary> {
    return this.writeTraces([trace]);
  }

  public async writeTraces(traces: readonly AgentSessionTrace[]): Promise<PostgresSessionWriterSummary> {
    if (traces.length === 0) {
      return {
        writtenSessions: 0,
        writtenCommits: 0
      };
    }

    const sessions = dedupeBySessionId(traces.map(toPostgresSessionRow));
    const commitRows = dedupeBySha(traces.flatMap((trace) => toPostgresCommitRows(trace)));

    await this.client.upsertSessions(sessions);
    await this.client.upsertCommits(commitRows);

    return {
      writtenSessions: sessions.length,
      writtenCommits: commitRows.length
    };
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (valueType !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record).every((key) => isJsonValue(record[key]));
}

export class PostgresSettingsWriter {
  private readonly client: PostgresSettingsPersistenceClient;

  public constructor(client: PostgresSettingsPersistenceClient) {
    this.client = client;
  }

  public async writeSetting(key: string, value: JsonValue): Promise<PostgresSettingsWriterSummary> {
    return this.writeSettings([{ key, value }]);
  }

  public async writeSettings(settings: readonly PostgresInstanceSettingRow[]): Promise<PostgresSettingsWriterSummary> {
    if (settings.length === 0) {
      return {
        writtenSettings: 0
      };
    }

    const validSettings = settings.filter(
      (setting) => setting.key.length > 0 && isJsonValue(setting.value)
    );
    if (validSettings.length === 0) {
      return {
        writtenSettings: 0
      };
    }

    const byKey = new Map<string, PostgresInstanceSettingRow>();
    validSettings.forEach((setting) => {
      byKey.set(setting.key, setting);
    });
    const rows = [...byKey.values()];

    await this.client.upsertInstanceSettings(rows);

    return {
      writtenSettings: rows.length
    };
  }
}

export function estimateTraceCostForCommits(trace: AgentSessionTrace): number {
  return toNonNegativeDecimal(trace.metrics.totalCostUsd);
}

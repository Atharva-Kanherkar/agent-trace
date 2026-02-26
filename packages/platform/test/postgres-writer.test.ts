import assert from "node:assert/strict";
import test from "node:test";

import type { AgentSessionTrace } from "../../schema/src/types";
import {
  PostgresSessionWriter,
  PostgresSettingsWriter,
  toPostgresCommitRows,
  toPostgresSessionRow
} from "../src/postgres-writer";
import type {
  PostgresCommitRow,
  PostgresInstanceSettingRow,
  PostgresPullRequestRow,
  PostgresSessionPersistenceClient,
  PostgresSessionRow,
  PostgresSettingsPersistenceClient
} from "../src/persistence-types";

function createSampleTrace(overrides: Partial<AgentSessionTrace> = {}): AgentSessionTrace {
  return {
    sessionId: "sess_platform_pg_sample",
    agentType: "claude_code",
    user: {
      id: "user_platform_pg_sample"
    },
    environment: {},
    startedAt: "2026-02-23T10:00:00.000Z",
    activeDurationMs: 0,
    timeline: [],
    metrics: {
      promptCount: 0,
      apiCallCount: 0,
      toolCallCount: 0,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      linesAdded: 0,
      linesRemoved: 0,
      filesTouched: [],
      modelsUsed: [],
      toolsUsed: []
    },
    git: {
      commits: [],
      pullRequests: []
    },
    ...overrides
  };
}

class MockSessionClient implements PostgresSessionPersistenceClient {
  public readonly sessionsRequests: Array<readonly PostgresSessionRow[]> = [];
  public readonly commitsRequests: Array<readonly PostgresCommitRow[]> = [];

  public async upsertSessions(rows: readonly PostgresSessionRow[]): Promise<void> {
    this.sessionsRequests.push(rows);
  }

  public async upsertCommits(rows: readonly PostgresCommitRow[]): Promise<void> {
    this.commitsRequests.push(rows);
  }

  public async upsertPullRequests(_rows: readonly PostgresPullRequestRow[]): Promise<void> {}
}

class MockSettingsClient implements PostgresSettingsPersistenceClient {
  public readonly requests: Array<readonly PostgresInstanceSettingRow[]> = [];

  public async upsertInstanceSettings(rows: readonly PostgresInstanceSettingRow[]): Promise<void> {
    this.requests.push(rows);
  }
}

test("toPostgresSessionRow maps session trace to postgres row shape", () => {
  const trace = createSampleTrace({
    sessionId: "sess_pg_001",
    startedAt: "2026-02-23T10:00:00.000Z",
    endedAt: "2026-02-23T10:10:00.000Z",
    user: {
      id: "user_pg_001"
    },
    environment: {
      projectPath: "/workspace/agent-trace",
      gitRepo: "Atharva-Kanherkar/agent-trace",
      gitBranch: "main"
    }
  });

  const row = toPostgresSessionRow(trace);
  assert.equal(row.session_id, "sess_pg_001");
  assert.equal(row.user_id, "user_pg_001");
  assert.equal(row.started_at, "2026-02-23T10:00:00.000Z");
  assert.equal(row.ended_at, "2026-02-23T10:10:00.000Z");
  assert.equal(row.status, "completed");
  assert.equal(row.project_path, "/workspace/agent-trace");
  assert.equal(row.git_repo, "Atharva-Kanherkar/agent-trace");
  assert.equal(row.git_branch, "main");
});

test("toPostgresCommitRows maps commit defaults when optional fields are missing", () => {
  const trace = createSampleTrace({
    sessionId: "sess_pg_002",
    git: {
      commits: [
        {
          sha: "sha_with_details",
          promptId: "prompt_1",
          message: "feat: first",
          linesAdded: 9,
          linesRemoved: 1,
          committedAt: "2026-02-23T10:05:00.000Z"
        },
        {
          sha: "sha_defaults"
        }
      ],
      pullRequests: []
    }
  });

  const rows = toPostgresCommitRows(trace);
  assert.equal(rows.length, 2);

  assert.equal(rows[0]?.sha, "sha_with_details");
  assert.equal(rows[0]?.prompt_id, "prompt_1");
  assert.equal(rows[0]?.lines_added, 9);
  assert.equal(rows[0]?.lines_removed, 1);

  assert.equal(rows[1]?.sha, "sha_defaults");
  assert.equal(rows[1]?.prompt_id, null);
  assert.equal(rows[1]?.message, null);
  assert.equal(rows[1]?.lines_added, 0);
  assert.equal(rows[1]?.lines_removed, 0);
  assert.equal(rows[1]?.chain_cost_usd, 0);
  assert.equal(rows[1]?.committed_at, null);
});

test("PostgresSessionWriter upserts deduped sessions and commits", async () => {
  const client = new MockSessionClient();
  const writer = new PostgresSessionWriter(client);

  const first = createSampleTrace({
    sessionId: "sess_pg_003",
    git: {
      commits: [
        {
          sha: "sha_same"
        },
        {
          sha: "sha_one"
        }
      ],
      pullRequests: []
    }
  });

  const second = createSampleTrace({
    sessionId: "sess_pg_003",
    user: {
      id: "user_updated"
    },
    git: {
      commits: [
        {
          sha: "sha_same",
          message: "updated message"
        },
        {
          sha: "sha_two"
        }
      ],
      pullRequests: []
    }
  });

  const result = await writer.writeTraces([first, second]);
  assert.equal(result.writtenSessions, 1);
  assert.equal(result.writtenCommits, 3);
  assert.equal(client.sessionsRequests.length, 1);
  assert.equal(client.commitsRequests.length, 1);
  assert.equal(client.sessionsRequests[0]?.[0]?.user_id, "user_updated");
});

test("PostgresSessionWriter skips writes for empty trace list", async () => {
  const client = new MockSessionClient();
  const writer = new PostgresSessionWriter(client);

  const result = await writer.writeTraces([]);
  assert.equal(result.writtenSessions, 0);
  assert.equal(result.writtenCommits, 0);
  assert.equal(client.sessionsRequests.length, 0);
  assert.equal(client.commitsRequests.length, 0);
});

test("PostgresSettingsWriter upserts deduped settings and ignores empty keys", async () => {
  const client = new MockSettingsClient();
  const writer = new PostgresSettingsWriter(client);

  const result = await writer.writeSettings([
    {
      key: "privacy_tier",
      value: 1
    },
    {
      key: "privacy_tier",
      value: 2
    },
    {
      key: "",
      value: true
    },
    {
      key: "retention_days",
      value: 30
    }
  ]);

  assert.equal(result.writtenSettings, 2);
  assert.equal(client.requests.length, 1);
  const rows = client.requests[0] ?? [];
  assert.equal(rows.length, 2);
  assert.equal(rows.some((row) => row.key === "privacy_tier" && row.value === 2), true);
  assert.equal(rows.some((row) => row.key === "retention_days" && row.value === 30), true);
});

test("PostgresSettingsWriter skips empty settings input", async () => {
  const client = new MockSettingsClient();
  const writer = new PostgresSettingsWriter(client);

  const result = await writer.writeSettings([]);
  assert.equal(result.writtenSettings, 0);
  assert.equal(client.requests.length, 0);
});

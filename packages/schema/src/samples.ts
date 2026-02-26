import type { AgentSessionTrace, EventEnvelope } from "./types";

export function createSampleEvent(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: "evt_001",
    sessionId: "sess_001",
    promptId: "prompt_001",
    eventType: "tool_result",
    eventTimestamp: "2026-02-23T10:00:00.000Z",
    ingestedAt: "2026-02-23T10:00:01.000Z",
    privacyTier: 1,
    payload: {
      toolName: "Read",
      toolSuccess: true
    },
    attributes: {
      terminal: "bash",
      project: "agent-trace"
    },
    ...overrides
  };
}

export function createSampleTrace(overrides: Partial<AgentSessionTrace> = {}): AgentSessionTrace {
  return {
    sessionId: "sess_001",
    agentType: "claude_code",
    user: {
      id: "user_001",
      email: "dev@example.com"
    },
    environment: {
      terminal: "bash",
      projectPath: "/home/atharva/agent-trace",
      gitRepo: "Atharva-Kanherkar/agent-trace",
      gitBranch: "main"
    },
    startedAt: "2026-02-23T10:00:00.000Z",
    endedAt: "2026-02-23T10:05:00.000Z",
    activeDurationMs: 300000,
    timeline: [
      {
        id: "evt_001",
        type: "user_prompt",
        timestamp: "2026-02-23T10:00:05.000Z",
        promptId: "prompt_001",
        tokens: {
          input: 120,
          output: 50
        }
      }
    ],
    metrics: {
      promptCount: 1,
      apiCallCount: 2,
      toolCallCount: 3,
      totalCostUsd: 0.45,
      totalInputTokens: 120,
      totalOutputTokens: 50,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      linesAdded: 10,
      linesRemoved: 2,
      filesTouched: ["README.md"],
      modelsUsed: ["claude-sonnet"],
      toolsUsed: ["Read", "Edit", "Bash"]
    },
    git: {
      commits: [
        {
          sha: "abc123",
          promptId: "prompt_001",
          message: "feat: add schema contracts",
          linesAdded: 10,
          linesRemoved: 2,
          committedAt: "2026-02-23T10:04:50.000Z"
        }
      ],
      pullRequests: [
        {
          repo: "Atharva-Kanherkar/agent-trace",
          prNumber: 1,
          state: "open"
        }
      ]
    },
    ...overrides
  };
}


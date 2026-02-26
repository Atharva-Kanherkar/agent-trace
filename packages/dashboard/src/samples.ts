import type { AgentSessionTrace } from "../../schema/src/types";

export function createDashboardSampleTrace(overrides: Partial<AgentSessionTrace> = {}): AgentSessionTrace {
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
        timestamp: "2026-02-23T10:00:01.000Z",
        promptId: "prompt_001",
        costUsd: 0.12
      },
      {
        id: "evt_002",
        type: "tool_result",
        timestamp: "2026-02-23T10:00:02.000Z",
        promptId: "prompt_001",
        costUsd: 0.3
      }
    ],
    metrics: {
      promptCount: 1,
      apiCallCount: 2,
      toolCallCount: 3,
      totalCostUsd: 0.42,
      totalInputTokens: 120,
      totalOutputTokens: 50,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      linesAdded: 12,
      linesRemoved: 2,
      filesTouched: ["README.md"],
      modelsUsed: ["claude-sonnet"],
      toolsUsed: ["Read", "Edit", "Bash"]
    },
    git: {
      commits: [],
      pullRequests: []
    },
    ...overrides
  };
}


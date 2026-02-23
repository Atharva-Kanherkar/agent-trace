import type { AgentSessionTrace } from "../../schema/src/types";

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
        promptId: "prompt_001"
      }
    ],
    metrics: {
      promptCount: 1,
      apiCallCount: 2,
      toolCallCount: 3,
      totalCostUsd: 0.42,
      totalInputTokens: 120,
      totalOutputTokens: 50,
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
          message: "feat: add api feature",
          committedAt: "2026-02-23T10:04:50.000Z"
        }
      ],
      pullRequests: []
    },
    ...overrides
  };
}


import type { AgentTraceClaudeHookConfig, AgentTraceClaudeHookEntry } from "./types";

const HOOK_EVENTS: readonly AgentTraceClaudeHookEntry["event"][] = [
  "SessionStart",
  "SessionEnd",
  "PostToolUse",
  "Stop",
  "TaskCompleted"
] as const;

export function buildClaudeHookConfig(hookCommand: string, generatedAt: string): AgentTraceClaudeHookConfig {
  return {
    version: "1.0",
    generatedAt,
    hooks: HOOK_EVENTS.map((event) => ({
      event,
      command: hookCommand
    }))
  };
}

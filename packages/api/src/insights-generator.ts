import type { AgentSessionTrace } from "../../schema/src/types";
import type { SessionInsight } from "../../schema/src/insights-types";
import type { LlmProvider } from "./insights-provider";

const SYSTEM_PROMPT = `You are an AI coding session analyst. You analyze telemetry from AI coding agent sessions and produce structured insights.

Return ONLY valid JSON with this exact schema:
{
  "summary": "2-3 sentence overview of what the session accomplished",
  "highlights": ["1-3 notable observations about the session"],
  "suggestions": ["0-3 actionable suggestions for improving efficiency"],
  "costNote": "optional one-line note about cost efficiency, or null"
}

Guidelines:
- summary: Describe what the agent accomplished concisely. Mention key outcomes (files changed, commits, PRs).
- highlights: Focus on interesting patterns — heavy tool usage, large diffs, cache efficiency, model choices.
- suggestions: Only suggest things that are actionable. If the session looks efficient, return an empty array.
- costNote: Comment on cost relative to output if noteworthy. Set to null if unremarkable.
- Be concise and specific. Reference actual numbers from the data.`;

function condensedTimeline(trace: AgentSessionTrace, maxChars: number): string {
  const lines: string[] = [];

  for (const event of trace.timeline) {
    const parts: string[] = [event.type];
    if (event.details !== undefined) {
      const d = event.details as Readonly<Record<string, unknown>>;
      const toolName = d["toolName"] ?? d["tool_name"];
      if (typeof toolName === "string") parts.push(toolName);
      const toolInput = d["toolInput"] ?? d["tool_input"];
      if (typeof toolInput === "object" && toolInput !== null) {
        const ti = toolInput as Record<string, unknown>;
        const fp = ti["file_path"] ?? ti["filePath"];
        if (typeof fp === "string") parts.push(fp);
        const cmd = ti["command"];
        if (typeof cmd === "string") parts.push(cmd.slice(0, 80));
      }
    }
    if (event.costUsd !== undefined && event.costUsd > 0) {
      parts.push(`$${event.costUsd.toFixed(4)}`);
    }
    const line = parts.join(" | ");
    lines.push(line);

    const totalLength = lines.reduce((sum, l) => sum + l.length + 1, 0);
    if (totalLength > maxChars) break;
  }

  return lines.join("\n");
}

export function buildInsightPrompt(trace: AgentSessionTrace): string {
  const m = trace.metrics;
  const sections: string[] = [];

  sections.push(`## Session: ${trace.sessionId}`);
  sections.push(`Started: ${trace.startedAt}${trace.endedAt !== undefined ? ` | Ended: ${trace.endedAt}` : ""}`);
  if (trace.environment.gitRepo !== undefined) {
    sections.push(`Repo: ${trace.environment.gitRepo}${trace.environment.gitBranch !== undefined ? ` (${trace.environment.gitBranch})` : ""}`);
  }

  sections.push(`\n## Metrics`);
  sections.push(`Prompts: ${String(m.promptCount)} | Tool calls: ${String(m.toolCallCount)} | API calls: ${String(m.apiCallCount)}`);
  sections.push(`Cost: $${m.totalCostUsd.toFixed(4)}`);
  sections.push(`Tokens: ${String(m.totalInputTokens)} in / ${String(m.totalOutputTokens)} out | Cache: ${String(m.totalCacheReadTokens)} read / ${String(m.totalCacheWriteTokens)} write`);
  sections.push(`Lines: +${String(m.linesAdded)} / -${String(m.linesRemoved)} | Files: ${String(m.filesTouched.length)}`);
  if (m.modelsUsed.length > 0) sections.push(`Models: ${m.modelsUsed.join(", ")}`);
  if (m.toolsUsed.length > 0) sections.push(`Tools: ${m.toolsUsed.join(", ")}`);

  if (trace.git.commits.length > 0) {
    sections.push(`\n## Commits (${String(trace.git.commits.length)})`);
    trace.git.commits.forEach((c) => {
      sections.push(`- ${c.sha.slice(0, 7)}: ${c.message ?? "no message"}`);
    });
  }

  if (trace.git.pullRequests.length > 0) {
    sections.push(`\n## Pull Requests (${String(trace.git.pullRequests.length)})`);
    trace.git.pullRequests.forEach((pr) => {
      sections.push(`- PR #${String(pr.prNumber)} (${pr.state}) in ${pr.repo}`);
    });
  }

  sections.push(`\n## Timeline (condensed)`);
  sections.push(condensedTimeline(trace, 4000));

  return sections.join("\n");
}

function parseInsightJson(raw: string): { summary: string; highlights: string[]; suggestions: string[]; costNote: string | undefined } | undefined {
  // Extract JSON from potential markdown fences
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch !== null && fenceMatch[1] !== undefined) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const obj = parsed as Record<string, unknown>;

    const summary = typeof obj["summary"] === "string" ? obj["summary"] : "";
    if (summary.length === 0) return undefined;

    const highlights = Array.isArray(obj["highlights"])
      ? obj["highlights"].filter((h): h is string => typeof h === "string")
      : [];
    const suggestions = Array.isArray(obj["suggestions"])
      ? obj["suggestions"].filter((s): s is string => typeof s === "string")
      : [];
    const costNote = typeof obj["costNote"] === "string" && obj["costNote"].length > 0
      ? obj["costNote"]
      : undefined;

    return { summary, highlights, suggestions, costNote };
  } catch {
    return undefined;
  }
}

export async function generateSessionInsight(
  trace: AgentSessionTrace,
  provider: LlmProvider
): Promise<SessionInsight> {
  const userPrompt = buildInsightPrompt(trace);
  const rawResponse = await provider.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseInsightJson(rawResponse);

  if (parsed === undefined) {
    return {
      sessionId: trace.sessionId,
      generatedAt: new Date().toISOString(),
      provider: provider.provider,
      model: provider.model,
      summary: rawResponse.slice(0, 500) || "Failed to generate structured insight.",
      highlights: [],
      suggestions: [],
    };
  }

  const result: SessionInsight = {
    sessionId: trace.sessionId,
    generatedAt: new Date().toISOString(),
    provider: provider.provider,
    model: provider.model,
    summary: parsed.summary,
    highlights: parsed.highlights,
    suggestions: parsed.suggestions
  };

  if (parsed.costNote !== undefined) {
    return { ...result, costNote: parsed.costNote };
  }

  return result;
}

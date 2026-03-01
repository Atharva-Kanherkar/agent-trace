import type { AgentSessionTrace } from "../../schema/src/types";
import type { TeamInsight, TeamInsightMemberHighlight, TeamInsightsContext } from "../../schema/src/insights-types";
import type { LlmProvider } from "./insights-provider";

const TEAM_SYSTEM_PROMPT = `You are the AI analytics engine for agent-trace, a developer tool that tracks AI coding agent usage across engineering teams. A manager is viewing their team dashboard and has requested your analysis.

<role>
You are a data analyst who turns raw telemetry into actionable management insights. You write like a sharp, senior engineering director — concise, evidence-based, zero fluff. Every sentence must reference a specific number from the data.
</role>

<output_format>
Respond with ONLY a single JSON object (no markdown fences, no commentary before or after). The JSON must conform exactly to this schema:

{"executiveSummary":"string","costAnalysis":"string","productivityAnalysis":"string","memberHighlights":[{"userId":"string","displayName":"string or null","strength":"string","concern":"string or null","recommendation":"string"}],"risks":["string"],"recommendations":["string"],"forecast":"string or null"}
</output_format>

<field_guidelines>
executiveSummary: 3-4 sentences. Open with the single most important finding. Include total spend, member count, commit count, and the key efficiency metric. End with overall team health assessment.

costAnalysis: 2-3 sentences. Rank members by cost-efficiency ($/commit). Call out the best and worst. If someone has high spend with zero or few commits, flag it directly. Compare individual $/commit to team average.

productivityAnalysis: 2-3 sentences. Analyze commit velocity, lines of code per session, and tool diversity. Note which tools correlate with higher output. Identify if anyone is underutilizing available tools.

memberHighlights: One entry per member in the data. userId must exactly match the data.
- strength: Reference their specific numbers. What do they do well relative to the team?
- concern: Reference specific numbers. Set to null only if genuinely nothing is concerning. Low commits, high cost, late-night patterns, or low tool diversity are all valid concerns.
- recommendation: One specific, actionable suggestion. "Try model X to reduce cost" or "Pair with alice on tool Y adoption."

risks: 1-3 items. Only risks supported by the data. Examples: budget trajectory, workload imbalance (compare session counts), burnout signals (late-night activity), single-model dependency, low commit rates.

recommendations: 3-5 items. Concrete and actionable. Reference specific members, models, or tools. Examples: "Switch bob from claude-opus to claude-sonnet to save ~40% on cost", "Rebalance: dave has 4x the sessions of carol."

forecast: If daily cost data has 3+ days, extrapolate monthly spend. Otherwise null.
</field_guidelines>

<constraints>
- Do NOT wrap the JSON in markdown code fences
- Do NOT include any text before or after the JSON
- Every claim must cite a number from the provided data
- Keep each string field under 500 characters
- The memberHighlights array must include ALL members present in the data
- Be constructive: frame concerns as improvement opportunities
</constraints>`;

interface MemberSummary {
  userId: string;
  displayName: string | null;
  sessionCount: number;
  totalCostUsd: number;
  commitCount: number;
  prCount: number;
  linesAdded: number;
  linesRemoved: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  models: string[];
  tools: string[];
  repos: string[];
  peakHours: number[];
  avgSessionCostUsd: number;
  costPerCommit: number;
}

function buildTeamAnalyticsPrompt(
  traces: readonly AgentSessionTrace[],
  from: string,
  to: string
): string {
  const sections: string[] = [];

  // Aggregate per-member
  const memberMap = new Map<string, MemberSummary>();
  let totalCost = 0;
  let totalCommits = 0;
  let totalPRs = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let totalSessions = 0;

  for (const trace of traces) {
    const userId = trace.user.id;
    if (userId === "unknown_user") continue;

    const existing = memberMap.get(userId) ?? {
      userId,
      displayName: trace.user.displayName ?? null,
      sessionCount: 0,
      totalCostUsd: 0,
      commitCount: 0,
      prCount: 0,
      linesAdded: 0,
      linesRemoved: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      models: [],
      tools: [],
      repos: [],
      peakHours: [],
      avgSessionCostUsd: 0,
      costPerCommit: 0
    };

    existing.sessionCount += 1;
    existing.totalCostUsd += trace.metrics.totalCostUsd;
    existing.commitCount += trace.git.commits.length;
    existing.prCount += trace.git.pullRequests.length;
    existing.linesAdded += trace.metrics.linesAdded;
    existing.linesRemoved += trace.metrics.linesRemoved;
    existing.totalInputTokens += trace.metrics.totalInputTokens;
    existing.totalOutputTokens += trace.metrics.totalOutputTokens;

    if (trace.user.displayName !== undefined) {
      existing.displayName = trace.user.displayName;
    }

    for (const model of trace.metrics.modelsUsed) {
      if (!existing.models.includes(model)) existing.models.push(model);
    }
    for (const tool of trace.metrics.toolsUsed) {
      if (!existing.tools.includes(tool)) existing.tools.push(tool);
    }
    const repo = trace.environment.gitRepo;
    if (repo !== undefined && repo.length > 0 && !existing.repos.includes(repo)) {
      existing.repos.push(repo);
    }

    const hour = new Date(trace.startedAt).getUTCHours();
    existing.peakHours.push(hour);

    totalCost += trace.metrics.totalCostUsd;
    totalCommits += trace.git.commits.length;
    totalPRs += trace.git.pullRequests.length;
    totalLinesAdded += trace.metrics.linesAdded;
    totalLinesRemoved += trace.metrics.linesRemoved;
    totalSessions += 1;

    memberMap.set(userId, existing);
  }

  // Build structured data document
  sections.push(`<team_data>`);
  sections.push(`<period from="${from}" to="${to}" />`);
  sections.push(`<summary members="${String(memberMap.size)}" sessions="${String(totalSessions)}" total_cost_usd="${totalCost.toFixed(2)}" total_commits="${String(totalCommits)}" total_prs="${String(totalPRs)}" lines_added="${String(totalLinesAdded)}" lines_removed="${String(totalLinesRemoved)}" avg_cost_per_session="${totalSessions > 0 ? (totalCost / totalSessions).toFixed(4) : "0"}" avg_cost_per_commit="${totalCommits > 0 ? (totalCost / totalCommits).toFixed(2) : "N/A"}" />`);

  // Per-member breakdown
  const members = [...memberMap.values()].sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  for (const m of members) {
    m.avgSessionCostUsd = m.sessionCount > 0 ? m.totalCostUsd / m.sessionCount : 0;
    m.costPerCommit = m.commitCount > 0 ? m.totalCostUsd / m.commitCount : 0;

    // Peak hours analysis
    const hourCounts = new Array(24).fill(0) as number[];
    for (const h of m.peakHours) hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const lateNight = m.peakHours.filter(h => h >= 22 || h <= 5).length;

    sections.push(`<member id="${m.userId}" display_name="${m.displayName ?? "none"}">`);
    sections.push(`  sessions="${String(m.sessionCount)}" cost_usd="${m.totalCostUsd.toFixed(2)}" avg_session_cost="${m.avgSessionCostUsd.toFixed(4)}"`);
    sections.push(`  commits="${String(m.commitCount)}" prs="${String(m.prCount)}" cost_per_commit="${m.commitCount > 0 ? m.costPerCommit.toFixed(2) : "N/A (0 commits)"}"`);
    sections.push(`  lines_added="${String(m.linesAdded)}" lines_removed="${String(m.linesRemoved)}"`);
    sections.push(`  input_tokens="${String(m.totalInputTokens)}" output_tokens="${String(m.totalOutputTokens)}"`);
    sections.push(`  models="${m.models.join(", ")}"`);
    sections.push(`  tools="${m.tools.slice(0, 12).join(", ")}${m.tools.length > 12 ? " +" + String(m.tools.length - 12) + " more" : ""}"`);
    sections.push(`  repos="${m.repos.join(", ")}"`);
    sections.push(`  peak_hour_utc="${String(peakHour)}" late_night_sessions="${String(lateNight)}"`);
    sections.push(`</member>`);
  }

  // Daily cost trend
  const dailyCost = new Map<string, number>();
  for (const trace of traces) {
    if (trace.user.id === "unknown_user") continue;
    const date = trace.startedAt.slice(0, 10);
    dailyCost.set(date, (dailyCost.get(date) ?? 0) + trace.metrics.totalCostUsd);
  }

  const sortedDays = [...dailyCost.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (sortedDays.length > 0) {
    sections.push(`<daily_cost_trend>`);
    for (const [date, cost] of sortedDays.slice(-14)) {
      sections.push(`  <day date="${date}" cost_usd="${cost.toFixed(2)}" />`);
    }
    sections.push(`</daily_cost_trend>`);
  }

  sections.push(`</team_data>`);

  sections.push(``);
  sections.push(`Analyze this team's AI coding agent usage. Respond with only the JSON object, no other text.`);

  return sections.join("\n");
}

function parseTeamInsightJson(raw: string): Omit<TeamInsight, "generatedAt" | "provider" | "model"> | undefined {
  let jsonStr = raw.trim();

  // Strip markdown fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch !== null && fenceMatch[1] !== undefined) {
    jsonStr = fenceMatch[1].trim();
  }

  // Try to find the JSON object if there's surrounding text
  if (!jsonStr.startsWith("{")) {
    const braceStart = jsonStr.indexOf("{");
    const braceEnd = jsonStr.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
    }
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const obj = parsed as Record<string, unknown>;

    const executiveSummary = typeof obj["executiveSummary"] === "string" ? obj["executiveSummary"] : "";
    if (executiveSummary.length === 0) return undefined;

    const costAnalysis = typeof obj["costAnalysis"] === "string" ? obj["costAnalysis"] : "";
    const productivityAnalysis = typeof obj["productivityAnalysis"] === "string" ? obj["productivityAnalysis"] : "";

    const rawMembers = Array.isArray(obj["memberHighlights"]) ? obj["memberHighlights"] : [];
    const memberHighlights: TeamInsightMemberHighlight[] = rawMembers
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m) => ({
        userId: typeof m["userId"] === "string" ? m["userId"] : "",
        displayName: typeof m["displayName"] === "string" ? m["displayName"] : null,
        strength: typeof m["strength"] === "string" ? m["strength"] : "",
        concern: typeof m["concern"] === "string" && m["concern"].length > 0 ? m["concern"] : null,
        recommendation: typeof m["recommendation"] === "string" ? m["recommendation"] : ""
      }))
      .filter((m) => m.userId.length > 0);

    const risks = Array.isArray(obj["risks"])
      ? obj["risks"].filter((r): r is string => typeof r === "string")
      : [];

    const recommendations = Array.isArray(obj["recommendations"])
      ? obj["recommendations"].filter((r): r is string => typeof r === "string")
      : [];

    const forecast = typeof obj["forecast"] === "string" && obj["forecast"].length > 0
      ? obj["forecast"]
      : null;

    return {
      executiveSummary,
      costAnalysis,
      productivityAnalysis,
      memberHighlights,
      risks,
      recommendations,
      forecast
    };
  } catch {
    return undefined;
  }
}

export async function generateTeamInsight(
  traces: readonly AgentSessionTrace[],
  from: string,
  to: string,
  provider: LlmProvider,
  context?: TeamInsightsContext
): Promise<TeamInsight> {
  const userPrompt = buildTeamAnalyticsPrompt(traces, from, to);
  let systemPrompt = TEAM_SYSTEM_PROMPT;
  if (context !== undefined) {
    if (context.companyContext.length > 0) {
      systemPrompt += `\n\n<company_context>\n${context.companyContext}\n</company_context>`;
    }
    if (context.analysisGuidelines.length > 0) {
      systemPrompt += `\n\n<manager_guidelines>\n${context.analysisGuidelines}\n</manager_guidelines>`;
    }
  }
  const rawResponse = await provider.complete(systemPrompt, userPrompt, 4096);
  const parsed = parseTeamInsightJson(rawResponse);

  if (parsed === undefined) {
    return {
      generatedAt: new Date().toISOString(),
      provider: provider.provider,
      model: provider.model,
      executiveSummary: rawResponse.slice(0, 800) || "Failed to generate structured team insight.",
      costAnalysis: "",
      productivityAnalysis: "",
      memberHighlights: [],
      risks: [],
      recommendations: [],
      forecast: null
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    provider: provider.provider,
    model: provider.model,
    ...parsed
  };
}

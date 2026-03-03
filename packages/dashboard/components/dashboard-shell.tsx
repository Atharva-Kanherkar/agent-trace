"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReactElement } from "react";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import ruby from "highlight.js/lib/languages/ruby";
import java from "highlight.js/lib/languages/java";
import markdown from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("java", java);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("toml", yaml);

import type {
  UiCostDailyPoint,
  UiSessionCommit,
  UiSessionPullRequest,
  UiSessionReplay,
  UiSessionReplayEvent,
  UiSessionSummary
} from "../src/next-types";

interface DashboardShellProps {
  readonly initialSessions: readonly UiSessionSummary[];
  readonly initialCostPoints: readonly UiCostDailyPoint[];
  readonly initialWarning?: string;
}

type StreamStatus = "connecting" | "live" | "polling" | "error";
type UnknownRecord = Record<string, unknown>;

interface PromptGroup {
  readonly promptId: string;
  readonly promptText: string | undefined;
  readonly responseText: string | undefined;
  readonly toolEvents: readonly UiSessionReplayEvent[];
  readonly commits: readonly UiSessionCommit[];
  readonly totalCostUsd: number;
  readonly totalToolCalls: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalCacheWriteTokens: number;
  readonly totalDurationMs: number;
  readonly filesRead: readonly string[];
  readonly filesWritten: readonly string[];
}

interface ToolDetail {
  readonly toolName: string;
  readonly filePath?: string;
  readonly command?: string;
  readonly pattern?: string;
  readonly oldString?: string;
  readonly newString?: string;
  readonly writeContent?: string;
  readonly description?: string;
}

interface TextSegment {
  readonly type: "text" | "code";
  readonly content: string;
  readonly lang?: string;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as UnknownRecord;
}

function readString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(record: UnknownRecord, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readNullableString(record: UnknownRecord, key: string): string | null | undefined {
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function extractPromptText(details: UnknownRecord | undefined): string | undefined {
  if (details === undefined) return undefined;
  return readString(details, "promptText");
}

function extractResponseText(details: UnknownRecord | undefined): string | undefined {
  if (details === undefined) return undefined;
  return readString(details, "responseText") ?? readString(details, "lastAssistantMessage");
}

function readStringFrom(primary: UnknownRecord | undefined, nested: UnknownRecord | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (primary !== undefined) { const v = readString(primary, key); if (v !== undefined) return v; }
    if (nested !== undefined) { const v = readString(nested, key); if (v !== undefined) return v; }
  }
  return undefined;
}

function extractFromTruncatedJson(raw: string, key: string): string | undefined {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"([^"]*?)"`);
  const match = pattern.exec(raw);
  return match !== null && match[1] !== undefined && match[1].length > 0 ? match[1] : undefined;
}

function extractToolDetail(event: UiSessionReplayEvent): ToolDetail {
  const details = event.details as UnknownRecord | undefined;
  const toolName = event.toolName ?? event.type;
  if (details === undefined) return { toolName };

  const rawToolInput = details["toolInput"] ?? details["tool_input"];
  const input = asRecord(rawToolInput);
  const inputStr = typeof rawToolInput === "string" ? rawToolInput : undefined;

  const filePath = readStringFrom(details, input, "filePath", "file_path")
    ?? (inputStr !== undefined ? extractFromTruncatedJson(inputStr, "file_path") ?? extractFromTruncatedJson(inputStr, "filePath") : undefined);
  const command = readStringFrom(details, input, "command", "cmd")
    ?? (inputStr !== undefined ? extractFromTruncatedJson(inputStr, "command") : undefined);
  const pattern = readStringFrom(details, input, "pattern")
    ?? (inputStr !== undefined ? extractFromTruncatedJson(inputStr, "pattern") : undefined);
  const oldString = readStringFrom(details, input, "oldString", "old_string");
  const newString = readStringFrom(details, input, "newString", "new_string");
  const writeContent = readString(details, "writeContent");
  const description = readStringFrom(details, input, "description")
    ?? (inputStr !== undefined ? extractFromTruncatedJson(inputStr, "description") : undefined);

  return {
    toolName,
    ...(filePath !== undefined ? { filePath } : {}),
    ...(command !== undefined ? { command } : {}),
    ...(pattern !== undefined ? { pattern } : {}),
    ...(oldString !== undefined ? { oldString } : {}),
    ...(newString !== undefined ? { newString } : {}),
    ...(writeContent !== undefined ? { writeContent } : {}),
    ...(description !== undefined ? { description } : {})
  };
}

function parseTextSegments(text: string): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", lang: match[1] ?? "text", content: match[2] ?? "" });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", content: text }];
}

function guessLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    css: "css", html: "html", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sh: "bash", bash: "bash", sql: "sql", toml: "toml",
  };
  return map[ext] ?? ext;
}

function parseSessionSummary(value: unknown): UiSessionSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const sessionId = readString(record, "sessionId");
  const userId = readString(record, "userId");
  const startedAt = readString(record, "startedAt");
  const endedAt = readNullableString(record, "endedAt");
  if (sessionId === undefined || userId === undefined || startedAt === undefined || endedAt === undefined) return undefined;
  return {
    sessionId, userId,
    gitRepo: readNullableString(record, "gitRepo") ?? null,
    gitBranch: readNullableString(record, "gitBranch") ?? null,
    startedAt, endedAt,
    promptCount: readNumber(record, "promptCount") ?? 0,
    toolCallCount: readNumber(record, "toolCallCount") ?? 0,
    totalCostUsd: readNumber(record, "totalCostUsd") ?? 0,
    commitCount: readNumber(record, "commitCount") ?? 0,
    linesAdded: readNumber(record, "linesAdded") ?? 0,
    linesRemoved: readNumber(record, "linesRemoved") ?? 0
  };
}

function parseCostPoint(value: unknown): UiCostDailyPoint | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const date = readString(record, "date");
  if (date === undefined) return undefined;
  return {
    date,
    totalCostUsd: readNumber(record, "totalCostUsd") ?? 0,
    sessionCount: readNumber(record, "sessionCount") ?? 0,
    promptCount: readNumber(record, "promptCount") ?? 0,
    toolCallCount: readNumber(record, "toolCallCount") ?? 0
  };
}

function parseReplay(value: unknown): UiSessionReplay | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const sessionId = readString(record, "sessionId");
  const startedAt = readString(record, "startedAt");
  const metrics = asRecord(record["metrics"]);
  const timelineRaw = record["timeline"];
  if (sessionId === undefined || startedAt === undefined || metrics === undefined || !Array.isArray(timelineRaw)) return undefined;

  const endedAt = readString(record, "endedAt");
  const envRecord = asRecord(record["environment"]);
  const gitBranch = (envRecord !== undefined ? readString(envRecord, "gitBranch") : undefined) ?? readString(record, "gitBranch");
  const gitRecord = asRecord(record["git"]);
  const commitsRaw = gitRecord !== undefined && Array.isArray(gitRecord["commits"])
    ? gitRecord["commits"]
    : Array.isArray(record["commits"]) ? record["commits"] : [];
  const commits: UiSessionCommit[] = commitsRaw
    .map((entry) => {
      const c = asRecord(entry);
      if (c === undefined) return undefined;
      const sha = readString(c, "sha");
      if (sha === undefined || sha.startsWith("placeholder_")) return undefined;
      return {
        sha,
        ...(readString(c, "message") !== undefined ? { message: readString(c, "message") } : {}),
        ...(readString(c, "promptId") !== undefined ? { promptId: readString(c, "promptId") } : {}),
        ...(readString(c, "committedAt") !== undefined ? { committedAt: readString(c, "committedAt") } : {})
      };
    })
    .filter((entry): entry is UiSessionCommit => entry !== undefined);

  const prsRaw = gitRecord !== undefined && Array.isArray(gitRecord["pullRequests"])
    ? gitRecord["pullRequests"]
    : Array.isArray(record["pullRequests"]) ? record["pullRequests"] : [];
  const pullRequests: UiSessionPullRequest[] = prsRaw
    .map((entry) => {
      const pr = asRecord(entry);
      if (pr === undefined) return undefined;
      const repo = readString(pr, "repo");
      const prNumber = readNumber(pr, "prNumber");
      if (repo === undefined || prNumber === undefined) return undefined;
      return {
        repo,
        prNumber,
        state: readString(pr, "state") ?? "open",
        ...(readString(pr, "url") !== undefined ? { url: readString(pr, "url") } : {})
      };
    })
    .filter((entry): entry is UiSessionPullRequest => entry !== undefined);

  return {
    sessionId, startedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    ...(gitBranch !== undefined ? { gitBranch } : {}),
    metrics: {
      promptCount: readNumber(metrics, "promptCount") ?? 0,
      toolCallCount: readNumber(metrics, "toolCallCount") ?? 0,
      totalCostUsd: readNumber(metrics, "totalCostUsd") ?? 0,
      totalInputTokens: readNumber(metrics, "totalInputTokens") ?? 0,
      totalOutputTokens: readNumber(metrics, "totalOutputTokens") ?? 0,
      totalCacheReadTokens: readNumber(metrics, "totalCacheReadTokens") ?? 0,
      totalCacheWriteTokens: readNumber(metrics, "totalCacheWriteTokens") ?? 0,
      linesAdded: readNumber(metrics, "linesAdded") ?? 0,
      linesRemoved: readNumber(metrics, "linesRemoved") ?? 0,
      modelsUsed: readStringArray(metrics, "modelsUsed"),
      toolsUsed: readStringArray(metrics, "toolsUsed"),
      filesTouched: readStringArray(metrics, "filesTouched")
    },
    commits,
    pullRequests,
    timeline: timelineRaw
      .map((entry) => {
        const event = asRecord(entry);
        if (event === undefined) return undefined;
        const id = readString(event, "id");
        const type = readString(event, "type");
        const timestamp = readString(event, "timestamp");
        if (id === undefined || type === undefined || timestamp === undefined) return undefined;
        const details = asRecord(event["details"]);
        const toolName = details === undefined ? undefined : readString(details, "toolName");
        const toolDurationMs = details === undefined ? undefined : readNumber(details, "toolDurationMs");
        const tokens = asRecord(event["tokens"]);
        const inputTokens = tokens === undefined ? undefined : readNumber(tokens, "input");
        const outputTokens = tokens === undefined ? undefined : readNumber(tokens, "output");
        const cacheReadTokens = tokens === undefined ? undefined : readNumber(tokens, "cacheRead");
        const cacheWriteTokens = tokens === undefined ? undefined : readNumber(tokens, "cacheWrite");
        return {
          id, type, timestamp,
          ...(readString(event, "promptId") !== undefined ? { promptId: readString(event, "promptId") } : {}),
          ...(readString(event, "status") !== undefined ? { status: readString(event, "status") } : {}),
          ...(readNumber(event, "costUsd") !== undefined ? { costUsd: readNumber(event, "costUsd") } : {}),
          ...(toolName !== undefined ? { toolName } : {}),
          ...(toolDurationMs !== undefined ? { toolDurationMs } : {}),
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
          ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
          ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
          ...(details !== undefined ? { details } : {})
        };
      })
      .filter((entry): entry is UiSessionReplay["timeline"][number] => entry !== undefined)
  };
}

function formatMoney(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatMoneyShort(value: number): string {
  return `$${value.toFixed(2)}`;
}

function sortSessionsLatestFirst(sessions: readonly UiSessionSummary[]): readonly UiSessionSummary[] {
  return [...sessions].sort((a, b) => Date.parse(ensureUtc(b.startedAt)) - Date.parse(ensureUtc(a.startedAt)));
}

function ensureUtc(value: string): string {
  if (value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value)) return value;
  return value.includes("T") ? `${value}Z` : `${value.replace(" ", "T")}Z`;
}

function formatDate(value: string): string {
  const parsed = Date.parse(ensureUtc(value));
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatTime(value: string): string {
  const parsed = Date.parse(ensureUtc(value));
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleTimeString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const TOOL_EVENT_TYPES = new Set(["tool_call", "tool_result"]);
const READ_TOOLS = new Set(["Read", "Glob", "Grep", "Search"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

function isToolEvent(event: UiSessionReplayEvent): boolean {
  if (event.toolName !== undefined) return true;
  if (TOOL_EVENT_TYPES.has(event.type)) return true;
  return false;
}

function looksLikeFileContent(text: string): boolean {
  const first = text.slice(0, 80);
  if (/^\s*\d+[→\t]/.test(first)) return true;
  if (/^[{<([]/.test(first.trim()) && text.length > 200) return true;
  return false;
}

function resolveFilePath(event: UiSessionReplayEvent): string | undefined {
  const d = event.details as UnknownRecord | undefined;
  if (d === undefined) return undefined;
  const rawTi = d["toolInput"] ?? d["tool_input"];
  const inp = asRecord(rawTi);
  const tiStr = typeof rawTi === "string" ? rawTi : undefined;
  return readStringFrom(d, inp, "filePath", "file_path")
    ?? (tiStr !== undefined ? extractFromTruncatedJson(tiStr, "file_path") ?? extractFromTruncatedJson(tiStr, "filePath") : undefined);
}

function deduplicateToolEvents(events: readonly UiSessionReplayEvent[]): readonly UiSessionReplayEvent[] {
  const result: UiSessionReplayEvent[] = [];
  for (const event of events) {
    const prev = result.length > 0 ? result[result.length - 1] : undefined;
    if (prev !== undefined && prev.toolName === event.toolName) {
      const prevFp = resolveFilePath(prev);
      const curFp = resolveFilePath(event);
      if (prevFp !== undefined && prevFp === curFp) continue;
    }
    result.push(event);
  }
  return result;
}

function buildPromptGroups(timeline: readonly UiSessionReplayEvent[], commits: readonly UiSessionCommit[]): {
  groups: readonly PromptGroup[];
} {
  const commitsByPrompt = new Map<string, UiSessionCommit[]>();
  for (const commit of commits) {
    if (commit.promptId === undefined) continue;
    const existing = commitsByPrompt.get(commit.promptId);
    if (existing !== undefined) { existing.push(commit); }
    else { commitsByPrompt.set(commit.promptId, [commit]); }
  }
  const promptOrder: string[] = [];
  const promptMap = new Map<string, UiSessionReplayEvent[]>();

  for (const event of timeline) {
    if (event.promptId === undefined || event.promptId === "") continue;
    const existing = promptMap.get(event.promptId);
    if (existing !== undefined) {
      existing.push(event);
    } else {
      promptOrder.push(event.promptId);
      promptMap.set(event.promptId, [event]);
    }
  }

  const groups: PromptGroup[] = promptOrder.map((promptId) => {
    const allEvents = promptMap.get(promptId) ?? [];
    let promptText: string | undefined;
    let responseText: string | undefined;
    let totalCostUsd = 0;
    let totalToolCalls = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let totalDurationMs = 0;
    const filesReadSet = new Set<string>();
    const filesWrittenSet = new Set<string>();
    const toolEventsRaw: UiSessionReplayEvent[] = [];

    for (const event of allEvents) {
      const details = event.details as UnknownRecord | undefined;
      if (promptText === undefined) {
        const pt = extractPromptText(details);
        if (pt !== undefined && !looksLikeFileContent(pt)) promptText = pt;
      }
      if (event.type === "assistant_response" || event.type === "api_call" || event.type === "api_response") {
        const rt = extractResponseText(details);
        if (rt !== undefined) responseText = rt;
      }
      totalCostUsd += event.costUsd ?? 0;
      totalInputTokens += event.inputTokens ?? 0;
      totalOutputTokens += event.outputTokens ?? 0;
      totalCacheReadTokens += event.cacheReadTokens ?? 0;
      totalCacheWriteTokens += event.cacheWriteTokens ?? 0;

      if (isToolEvent(event)) {
        toolEventsRaw.push(event);
        totalToolCalls++;
        if (event.toolDurationMs !== undefined) totalDurationMs += event.toolDurationMs;
        const d = event.details as UnknownRecord | undefined;
        const rawTi = d !== undefined ? d["toolInput"] ?? d["tool_input"] : undefined;
        const inp = asRecord(rawTi);
        const tiStr = typeof rawTi === "string" ? rawTi : undefined;
        const fp = readStringFrom(d, inp, "filePath", "file_path")
          ?? (tiStr !== undefined ? extractFromTruncatedJson(tiStr, "file_path") ?? extractFromTruncatedJson(tiStr, "filePath") : undefined);
        if (fp !== undefined) {
          const tn = event.toolName ?? "";
          if (WRITE_TOOLS.has(tn)) filesWrittenSet.add(fp);
          else if (READ_TOOLS.has(tn)) filesReadSet.add(fp);
        }
      }
    }

    const toolEvents = deduplicateToolEvents(toolEventsRaw);

    return {
      promptId, promptText, responseText, toolEvents,
      commits: commitsByPrompt.get(promptId) ?? [],
      totalCostUsd, totalToolCalls, totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheWriteTokens, totalDurationMs,
      filesRead: [...filesReadSet], filesWritten: [...filesWrittenSet]
    };
  });

  return {
    groups: groups.filter(
      (g) => g.promptText !== undefined || g.toolEvents.length > 0 || g.responseText !== undefined
    )
  };
}

function HighlightedCode({ code, lang }: { readonly code: string; readonly lang?: string | undefined }): ReactElement {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current === null) return;
    try { hljs.highlightElement(ref.current); } catch { /* unsupported lang */ }
  }, [code, lang]);

  return (
    <pre className="code-block-body">
      <code ref={ref} className={lang !== undefined ? `language-${lang}` : ""}>{code}</code>
    </pre>
  );
}

function FormattedText({ text }: { readonly text: string }): ReactElement {
  const segments = useMemo(() => parseTextSegments(text), [text]);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "code") {
          return (
            <div key={i} className="code-block">
              <div className="code-block-header">{seg.lang}</div>
              <HighlightedCode code={seg.content} lang={seg.lang} />
            </div>
          );
        }
        return <span key={i}>{seg.content}</span>;
      })}
    </>
  );
}

function ToolDetailView({ event }: { readonly event: UiSessionReplayEvent }): ReactElement {
  const detail = useMemo(() => extractToolDetail(event), [event]);

  if (detail.toolName === "Bash" && detail.command !== undefined) {
    return (
      <div className="tool-detail-structured">
        <div className="code-block">
          <div className="code-block-header">bash</div>
          <HighlightedCode code={detail.command} lang="bash" />
        </div>
      </div>
    );
  }

  if (detail.toolName === "Edit" && detail.filePath !== undefined) {
    return (
      <div className="tool-detail-structured">
        <div className="tool-file-path">{detail.filePath}</div>
        {detail.oldString !== undefined && (
          <div className="diff-block">
            <div className="diff-removed">
              <div className="diff-label">-</div>
              <pre><code>{detail.oldString}</code></pre>
            </div>
            {detail.newString !== undefined && (
              <div className="diff-added">
                <div className="diff-label">+</div>
                <pre><code>{detail.newString}</code></pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if ((detail.toolName === "Grep" || detail.toolName === "Glob") && detail.pattern !== undefined) {
    return (
      <div className="tool-detail-structured">
        <span className="tool-pattern">{detail.toolName === "Grep" ? `/${detail.pattern}/` : detail.pattern}</span>
        {detail.filePath !== undefined && <> <span className="tool-file-path">{detail.filePath}</span></>}
      </div>
    );
  }

  if (detail.toolName === "Task" && detail.description !== undefined) {
    return (
      <div className="tool-detail-structured">
        <span className="event-detail">{detail.description}</span>
      </div>
    );
  }

  if (detail.toolName === "Write" && detail.filePath !== undefined) {
    const lang = guessLang(detail.filePath);
    return (
      <div className="tool-detail-structured">
        <div className="tool-file-path">{detail.filePath}</div>
        {detail.writeContent !== undefined && (
          <div className="code-block">
            <div className="code-block-header">{lang || "text"}</div>
            <HighlightedCode code={detail.writeContent} lang={lang} />
          </div>
        )}
      </div>
    );
  }

  if (detail.filePath !== undefined) {
    return (
      <div className="tool-detail-structured">
        <div className="tool-file-path">{detail.filePath}</div>
      </div>
    );
  }

  if (detail.command !== undefined) {
    return (
      <div className="tool-detail-structured">
        <div className="code-block">
          <div className="code-block-header">shell</div>
          <HighlightedCode code={detail.command} lang="bash" />
        </div>
      </div>
    );
  }

  return <></>;
}

function eventIconClass(event: UiSessionReplayEvent): string {
  if (event.status === "error") return "event-icon error";
  if (event.toolName !== undefined) return "event-icon tool";
  return "event-icon api";
}

function eventIconChar(event: UiSessionReplayEvent): string {
  if (event.status === "error") return "!";
  if (event.toolName !== undefined) return "T";
  return "E";
}

function EventRow({ event }: { readonly event: UiSessionReplayEvent }): ReactElement {
  return (
    <div className="event-row">
      <div className={eventIconClass(event)}>
        {eventIconChar(event)}
      </div>
      <div className="event-content">
        <div className="event-label">{event.toolName ?? event.type}</div>
        <ToolDetailView event={event} />
      </div>
      <div className="event-meta">
        {event.toolDurationMs !== undefined && (
          <span className="badge">{formatDuration(event.toolDurationMs)}</span>
        )}
        {event.costUsd !== undefined && event.costUsd > 0 && (
          <span className="badge orange">{formatMoney(event.costUsd)}</span>
        )}
        {event.status !== undefined && (
          <span className={`badge ${event.status === "error" ? "red" : event.status === "ok" || event.status === "success" ? "green" : ""}`}>
            {event.status}
          </span>
        )}
        <span style={{ color: "var(--text-dim)" }}>{formatTime(event.timestamp)}</span>
      </div>
    </div>
  );
}

function PromptCard({ group, index }: { readonly group: PromptGroup; readonly index: number }): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className={`prompt-group${expanded ? " expanded" : ""}`}>
      <div className="prompt-header" onClick={toggle}>
        <div className="prompt-index">{String(index)}</div>
        <div className={`prompt-text${expanded ? "" : " truncated"}`}>
          {group.promptText ?? `prompt ${group.promptId.slice(0, 8)}`}
        </div>
        <div className="prompt-stats">
          {group.commits.length > 0 && (
            <span className="badge commit-badge">{group.commits.length === 1 ? group.commits[0]?.sha.slice(0, 7) ?? "commit" : `${String(group.commits.length)} commits`}</span>
          )}
          {group.totalToolCalls > 0 && (
            <span className="badge purple">{String(group.totalToolCalls)} tools</span>
          )}
          {group.filesWritten.length > 0 && (
            <span className="badge green">{String(group.filesWritten.length)} written</span>
          )}
          {group.filesRead.length > 0 && (
            <span className="badge">{String(group.filesRead.length)} read</span>
          )}
          {group.totalCostUsd > 0 && (
            <span className="badge orange">{formatMoney(group.totalCostUsd)}</span>
          )}
        </div>
        <div className={`prompt-expand${expanded ? " open" : ""}`}>{">"}</div>
      </div>

      {expanded && (
        <div className="prompt-body">
          {group.commits.length > 0 && (
            <div className="prompt-commits">
              {group.commits.map((commit) => (
                <div key={commit.sha} className="prompt-commit">
                  <span className="commit-sha">{commit.sha.slice(0, 7)}</span>
                  <span className="commit-message">{commit.message ?? "no message"}</span>
                </div>
              ))}
            </div>
          )}

          {group.toolEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}

          {(group.filesWritten.length > 0 || group.filesRead.length > 0) && (
            <div className="files-summary">
              {group.filesWritten.length > 0 && (
                <div className="files-summary-group">
                  <span className="files-summary-label written">written</span>
                  {group.filesWritten.map((f) => (
                    <span key={f} className="files-summary-path">{f}</span>
                  ))}
                </div>
              )}
              {group.filesRead.length > 0 && (
                <div className="files-summary-group">
                  <span className="files-summary-label read">read</span>
                  {group.filesRead.map((f) => (
                    <span key={f} className="files-summary-path">{f}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {group.responseText !== undefined && (
            <div className="response-block">
              <div className="response-label">Response</div>
              <div className="response-text">
                <FormattedText text={group.responseText} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type DashboardTab = "sessions" | "team" | "insights" | "org";
type AuthState = "checking" | "required" | "authenticated";
type AuthMode = "signin" | "signup" | "token";
type RangeKey = "week" | "month" | "30d";

interface AuthOrganization {
  readonly orgId: string;
  readonly name: string;
}

interface TeamOverview {
  readonly memberCount: number;
  readonly totalCostUsd: number;
  readonly totalSessions: number;
  readonly totalCommits: number;
  readonly costPerCommit: number;
  readonly periodLabel: string;
}

interface TeamMemberRow {
  readonly userId: string;
  readonly displayName: string | null;
  readonly sessionCount: number;
  readonly totalCostUsd: number;
  readonly commitCount: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly lastActiveAt: string;
}

interface TeamCostPoint {
  readonly date: string;
  readonly totalCostUsd: number;
}

interface TeamBudgetState {
  readonly monthlyLimitUsd: number;
  readonly currentMonthSpend: number;
  readonly percentUsed: number;
  readonly alertThresholdPercent: number;
}

interface InsightsSummaryState {
  readonly avgCostPerSession: number;
  readonly avgCommitsPerSession: number;
  readonly avgCostPerCommit: number;
  readonly totalTokensUsed: number;
  readonly costEfficiencyScore: number;
  readonly topModels: readonly { model: string; totalCostUsd: number }[];
  readonly topTools: readonly { tool: string; callCount: number }[];
  readonly periodLabel: string;
}

interface SaasSnapshotState {
  readonly orgId: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
  readonly subscriptionStatus: string;
  readonly seatLimit: number;
  readonly activeMemberCount: number;
  readonly memberCount: number;
  readonly seatUtilizationPercent: number;
  readonly trialEndsAt: string | null;
  readonly currentMonthCostUsd: number;
}

interface SaasMemberState {
  readonly userId: string;
  readonly role: string;
  readonly status: string;
}

interface SessionInsightState {
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly suggestions: readonly string[];
  readonly costNote?: string;
}

interface TeamInsightState {
  readonly executiveSummary: string;
  readonly costAnalysis: string;
  readonly productivityAnalysis: string;
  readonly recommendations: readonly string[];
  readonly risks: readonly string[];
}

function readBoolean(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function rangeToQuery(range: RangeKey): string {
  const now = new Date();
  let from: string;
  let to: string;
  if (range === "week") {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    from = monday.toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  } else if (range === "month") {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const endDay = String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, "0");
    from = `${String(year)}-${month}-01`;
    to = `${String(year)}-${month}-${endDay}`;
  } else {
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 30);
    from = fromDate.toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  }
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function parseTeamOverview(payload: unknown): TeamOverview | undefined {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return undefined;
  }
  const period = asRecord(record["period"]);
  const from = period !== undefined ? readString(period, "from") : undefined;
  const to = period !== undefined ? readString(period, "to") : undefined;
  return {
    memberCount: readNumber(record, "memberCount") ?? 0,
    totalCostUsd: readNumber(record, "totalCostUsd") ?? 0,
    totalSessions: readNumber(record, "totalSessions") ?? 0,
    totalCommits: readNumber(record, "totalCommits") ?? 0,
    costPerCommit: readNumber(record, "costPerCommit") ?? 0,
    periodLabel: from !== undefined && to !== undefined ? `${from} to ${to}` : "current range"
  };
}

function parseTeamMembers(payload: unknown): readonly TeamMemberRow[] {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return [];
  }
  const rows = record["members"];
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((value) => {
    const row = asRecord(value);
    if (row === undefined) {
      return undefined;
    }
    const userId = readString(row, "userId");
    if (userId === undefined) {
      return undefined;
    }
    return {
      userId,
      displayName: readNullableString(row, "displayName") ?? null,
      sessionCount: readNumber(row, "sessionCount") ?? 0,
      totalCostUsd: readNumber(row, "totalCostUsd") ?? 0,
      commitCount: readNumber(row, "commitCount") ?? 0,
      linesAdded: readNumber(row, "linesAdded") ?? 0,
      linesRemoved: readNumber(row, "linesRemoved") ?? 0,
      lastActiveAt: readString(row, "lastActiveAt") ?? ""
    };
  }).filter((row): row is TeamMemberRow => row !== undefined);
}

function parseTeamCost(payload: unknown): readonly TeamCostPoint[] {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return [];
  }
  const rows = record["points"];
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((value) => {
    const row = asRecord(value);
    if (row === undefined) {
      return undefined;
    }
    const date = readString(row, "date");
    if (date === undefined) {
      return undefined;
    }
    return {
      date,
      totalCostUsd: readNumber(row, "totalCostUsd") ?? 0
    };
  }).filter((row): row is TeamCostPoint => row !== undefined);
}

function parseTeamBudget(payload: unknown): TeamBudgetState | undefined {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return undefined;
  }
  const budget = asRecord(record["budget"]);
  if (budget === undefined) {
    return undefined;
  }
  return {
    monthlyLimitUsd: readNumber(budget, "monthlyLimitUsd") ?? 0,
    currentMonthSpend: readNumber(record, "currentMonthSpend") ?? 0,
    percentUsed: readNumber(record, "percentUsed") ?? 0,
    alertThresholdPercent: readNumber(budget, "alertThresholdPercent") ?? 80
  };
}

function parseInsightsSummary(payload: unknown): InsightsSummaryState | undefined {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return undefined;
  }
  const period = asRecord(record["period"]);
  const from = period !== undefined ? readString(period, "from") : undefined;
  const to = period !== undefined ? readString(period, "to") : undefined;

  const topModelsRaw = record["topModels"];
  const topToolsRaw = record["topTools"];
  const topModels = Array.isArray(topModelsRaw)
    ? topModelsRaw.map((value) => {
        const model = asRecord(value);
        if (model === undefined) return undefined;
        const name = readString(model, "model");
        if (name === undefined) return undefined;
        return {
          model: name,
          totalCostUsd: readNumber(model, "totalCostUsd") ?? 0
        };
      }).filter((entry): entry is { model: string; totalCostUsd: number } => entry !== undefined)
    : [];

  const topTools = Array.isArray(topToolsRaw)
    ? topToolsRaw.map((value) => {
        const tool = asRecord(value);
        if (tool === undefined) return undefined;
        const name = readString(tool, "tool");
        if (name === undefined) return undefined;
        return {
          tool: name,
          callCount: readNumber(tool, "callCount") ?? 0
        };
      }).filter((entry): entry is { tool: string; callCount: number } => entry !== undefined)
    : [];

  return {
    avgCostPerSession: readNumber(record, "avgCostPerSession") ?? 0,
    avgCommitsPerSession: readNumber(record, "avgCommitsPerSession") ?? 0,
    avgCostPerCommit: readNumber(record, "avgCostPerCommit") ?? 0,
    totalTokensUsed: readNumber(record, "totalTokensUsed") ?? 0,
    costEfficiencyScore: readNumber(record, "costEfficiencyScore") ?? 0,
    topModels,
    topTools,
    periodLabel: from !== undefined && to !== undefined ? `${from} to ${to}` : "current range"
  };
}

function parseSessionInsight(payload: unknown): SessionInsightState | undefined {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return undefined;
  }
  const insight = asRecord(record["insight"]);
  if (insight === undefined) {
    return undefined;
  }
  const summary = readString(insight, "summary");
  if (summary === undefined) {
    return undefined;
  }
  const highlights = readStringArray(insight, "highlights");
  const suggestions = readStringArray(insight, "suggestions");
  const costNote = readString(insight, "costNote");
  return {
    summary,
    highlights,
    suggestions,
    ...(costNote !== undefined ? { costNote } : {})
  };
}

function parseTeamInsight(payload: unknown): TeamInsightState | undefined {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return undefined;
  }
  const insight = asRecord(record["insight"]);
  if (insight === undefined) {
    return undefined;
  }
  const executiveSummary = readString(insight, "executiveSummary");
  const costAnalysis = readString(insight, "costAnalysis");
  const productivityAnalysis = readString(insight, "productivityAnalysis");
  if (executiveSummary === undefined || costAnalysis === undefined || productivityAnalysis === undefined) {
    return undefined;
  }
  return {
    executiveSummary,
    costAnalysis,
    productivityAnalysis,
    recommendations: readStringArray(insight, "recommendations"),
    risks: readStringArray(insight, "risks")
  };
}

function parseSaasSnapshot(payload: unknown): SaasSnapshotState | undefined {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return undefined;
  }
  const snapshot = asRecord(record["snapshot"]);
  if (snapshot === undefined) {
    return undefined;
  }
  const org = asRecord(snapshot["organization"]);
  if (org === undefined) {
    return undefined;
  }
  const orgId = readString(org, "orgId");
  const name = readString(org, "name");
  const slug = readString(org, "slug");
  const plan = readString(org, "plan");
  const subscriptionStatus = readString(org, "subscriptionStatus");
  if (orgId === undefined || name === undefined || slug === undefined || plan === undefined || subscriptionStatus === undefined) {
    return undefined;
  }

  const usage = asRecord(snapshot["currentMonthUsage"]);

  return {
    orgId,
    name,
    slug,
    plan,
    subscriptionStatus,
    seatLimit: readNumber(org, "seatLimit") ?? 0,
    activeMemberCount: readNumber(snapshot, "activeMemberCount") ?? 0,
    memberCount: readNumber(snapshot, "memberCount") ?? 0,
    seatUtilizationPercent: readNumber(snapshot, "seatUtilizationPercent") ?? 0,
    trialEndsAt: readNullableString(org, "trialEndsAt") ?? null,
    currentMonthCostUsd: usage !== undefined ? (readNumber(usage, "totalCostUsd") ?? 0) : 0
  };
}

function parseSaasMembers(payload: unknown): readonly SaasMemberState[] {
  const record = asRecord(payload);
  if (record === undefined || readString(record, "status") !== "ok") {
    return [];
  }
  const rows = record["members"];
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((value) => {
    const row = asRecord(value);
    if (row === undefined) return undefined;
    const userId = readString(row, "userId");
    const role = readString(row, "role");
    const status = readString(row, "status");
    if (userId === undefined || role === undefined || status === undefined) {
      return undefined;
    }
    return { userId, role, status };
  }).filter((entry): entry is SaasMemberState => entry !== undefined);
}

function parseAuthOrganizations(payload: unknown): readonly AuthOrganization[] {
  const record = asRecord(payload);
  if (record === undefined) {
    return [];
  }
  const raw = record["organizations"];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((value) => {
    const entry = asRecord(value);
    if (entry === undefined) {
      return undefined;
    }
    const orgId = readString(entry, "orgId");
    const name = readString(entry, "name");
    if (orgId === undefined || name === undefined) {
      return undefined;
    }
    return { orgId, name };
  }).filter((entry): entry is AuthOrganization => entry !== undefined);
}

export function DashboardShell(props: DashboardShellProps): ReactElement {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authTokenInput, setAuthTokenInput] = useState<string>("");
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authDisplayName, setAuthDisplayName] = useState<string>("");
  const [authOrgName, setAuthOrgName] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("sessions");

  const [sessions, setSessions] = useState<readonly UiSessionSummary[]>(props.initialSessions);
  const [costPoints, setCostPoints] = useState<readonly UiCostDailyPoint[]>(props.initialCostPoints);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(props.initialSessions[0]?.sessionId);
  const [sessionReplay, setSessionReplay] = useState<UiSessionReplay | undefined>(undefined);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState<string>("Connecting...");
  const [warning, setWarning] = useState<string | undefined>(props.initialWarning);

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [insightsConfigured, setInsightsConfigured] = useState<boolean>(false);
  const [provider, setProvider] = useState<string>("anthropic");
  const [apiKey, setApiKey] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [settingsStatus, setSettingsStatus] = useState<string>("");

  const [sessionInsights, setSessionInsights] = useState<Readonly<Record<string, SessionInsightState>>>({});
  const [sessionInsightStatus, setSessionInsightStatus] = useState<string>("");

  const [teamRange, setTeamRange] = useState<RangeKey>("30d");
  const [teamOverview, setTeamOverview] = useState<TeamOverview | undefined>(undefined);
  const [teamMembers, setTeamMembers] = useState<readonly TeamMemberRow[]>([]);
  const [teamCost, setTeamCost] = useState<readonly TeamCostPoint[]>([]);
  const [teamBudget, setTeamBudget] = useState<TeamBudgetState | undefined>(undefined);
  const [teamStatus, setTeamStatus] = useState<string>("");
  const [budgetLimitInput, setBudgetLimitInput] = useState<string>("");
  const [budgetThresholdInput, setBudgetThresholdInput] = useState<string>("80");
  const [budgetStatus, setBudgetStatus] = useState<string>("");

  const [insightsRange, setInsightsRange] = useState<RangeKey>("30d");
  const [insightsSummary, setInsightsSummary] = useState<InsightsSummaryState | undefined>(undefined);
  const [insightsStatus, setInsightsStatus] = useState<string>("");
  const [teamInsight, setTeamInsight] = useState<TeamInsightState | undefined>(undefined);
  const [teamInsightStatus, setTeamInsightStatus] = useState<string>("");
  const [contextOpen, setContextOpen] = useState<boolean>(false);
  const [contextCompany, setContextCompany] = useState<string>("");
  const [contextGuidelines, setContextGuidelines] = useState<string>("");
  const [contextStatus, setContextStatus] = useState<string>("");

  const [saasOrgId, setSaasOrgId] = useState<string>("");
  const [saasSnapshot, setSaasSnapshot] = useState<SaasSnapshotState | undefined>(undefined);
  const [saasApiKey, setSaasApiKey] = useState<string>("");
  const [saasMembers, setSaasMembers] = useState<readonly SaasMemberState[]>([]);
  const [saasStatus, setSaasStatus] = useState<string>("");
  const [saasName, setSaasName] = useState<string>("");
  const [saasEmail, setSaasEmail] = useState<string>("");
  const [saasPlan, setSaasPlan] = useState<string>("team");
  const [saasSeatLimit, setSaasSeatLimit] = useState<string>("10");
  const [saasTrialDays, setSaasTrialDays] = useState<string>("14");
  const [saasMemberUserId, setSaasMemberUserId] = useState<string>("");
  const [saasMemberRole, setSaasMemberRole] = useState<string>("member");
  const [saasCheckoutUrl, setSaasCheckoutUrl] = useState<string>("");

  const fetchJson = useCallback(async (url: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetch(url, {
      cache: "no-store",
      ...(init ?? {})
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const record = asRecord(payload);
      const message = record !== undefined ? readString(record, "message") : undefined;
      throw new Error(message ?? `request failed (${String(response.status)})`);
    }
    return payload;
  }, []);

  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      const payload = asRecord(await fetchJson("/api/settings/insights"));
      if (payload === undefined) return;
      const configured = readBoolean(payload, "configured") ?? false;
      setInsightsConfigured(configured);
      const parsedProvider = readString(payload, "provider");
      const parsedModel = readString(payload, "model");
      if (parsedProvider !== undefined) setProvider(parsedProvider);
      if (parsedModel !== undefined) setModel(parsedModel);
    } catch {
      // best effort
    }
  }, [fetchJson]);

  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const payload = asRecord(await fetchJson("/api/auth/check"));
      if (payload === undefined) {
        setAuthState("required");
        return;
      }
      const required = readBoolean(payload, "authRequired") ?? false;
      const valid = readBoolean(payload, "authValid") ?? false;
      const hasUsers = readBoolean(payload, "hasUsers") ?? false;
      const method = readString(payload, "method");
      const user = asRecord(payload["user"]);
      const organizations = parseAuthOrganizations(payload);

      setAuthRequired(required);
      setAuthState(!required || valid ? "authenticated" : "required");
      if (valid) {
        setAuthError("");
        const userEmail = user !== undefined ? (readString(user, "email") ?? "") : "";
        const userName = user !== undefined ? (readString(user, "displayName") ?? "") : "";
        setCurrentUserEmail(userEmail);
        setCurrentUserName(userName);
        if (organizations.length > 0 && saasOrgId.length === 0) {
          const firstOrg = organizations[0];
          if (firstOrg !== undefined) {
            setSaasOrgId(firstOrg.orgId);
          }
        }
        void loadSettings();
      } else {
        setCurrentUserEmail("");
        setCurrentUserName("");
        if (!hasUsers) {
          setAuthMode("signup");
        } else if (method === "token") {
          setAuthMode("token");
        } else {
          setAuthMode("signin");
        }
      }
    } catch (error: unknown) {
      setAuthState("required");
      setAuthError(String(error));
    }
  }, [fetchJson, loadSettings, saasOrgId]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedOrgId = window.localStorage.getItem("agent_trace_saas_org_id");
    if (savedOrgId !== null && savedOrgId.length > 0) {
      setSaasOrgId(savedOrgId);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (saasOrgId.length > 0) {
      window.localStorage.setItem("agent_trace_saas_org_id", saasOrgId);
    } else {
      window.localStorage.removeItem("agent_trace_saas_org_id");
    }
  }, [saasOrgId]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    let active = true;
    let eventSource: EventSource | undefined;

    const loadSnapshot = async (): Promise<void> => {
      try {
        const sessionsPayload = asRecord(await fetchJson("/api/sessions"));
        const costPayload = asRecord(await fetchJson("/api/analytics/cost/daily"));
        if (sessionsPayload === undefined || costPayload === undefined) {
          throw new Error("snapshot payload invalid");
        }
        const sessionsRaw = sessionsPayload["sessions"];
        const pointsRaw = costPayload["points"];
        if (!Array.isArray(sessionsRaw) || !Array.isArray(pointsRaw)) {
          throw new Error("snapshot arrays missing");
        }

        const parsedSessions = sessionsRaw.map((e) => parseSessionSummary(e)).filter(
          (e): e is UiSessionSummary => e !== undefined
        );
        const parsedCostPoints = pointsRaw.map((e) => parseCostPoint(e)).filter(
          (e): e is UiCostDailyPoint => e !== undefined
        );

        if (!active) return;
        setSessions(sortSessionsLatestFirst(parsedSessions));
        setCostPoints(parsedCostPoints);
        setWarning(undefined);
        if (streamStatus !== "live") {
          setStreamStatus("polling");
          setStatusMessage("Polling");
        }
      } catch (error: unknown) {
        if (!active) return;
        setWarning(String(error));
        setStreamStatus("error");
        setStatusMessage("Refresh failed");
      }
    };

    void loadSnapshot();
    const interval = setInterval(() => {
      void loadSnapshot();
    }, 15000);

    if (typeof EventSource !== "undefined") {
      eventSource = new EventSource("/api/sessions/stream");
      eventSource.addEventListener("sessions", (event) => {
        const message = event as MessageEvent<string>;
        const payload = asRecord(JSON.parse(message.data) as unknown);
        if (payload === undefined) return;
        const sessionsRaw = payload["sessions"];
        if (!Array.isArray(sessionsRaw)) return;
        const parsedSessions = sessionsRaw.map((e) => parseSessionSummary(e)).filter(
          (e): e is UiSessionSummary => e !== undefined
        );
        if (!active) return;
        setSessions(sortSessionsLatestFirst(parsedSessions));
        setStreamStatus("live");
        setStatusMessage("Live");
      });
      eventSource.onerror = () => {
        if (!active) return;
        setStreamStatus("polling");
        setStatusMessage("Polling");
      };
    } else {
      setStreamStatus("polling");
      setStatusMessage("Polling");
    }

    return () => {
      active = false;
      clearInterval(interval);
      if (eventSource !== undefined) {
        eventSource.close();
      }
    };
  }, [authState, fetchJson, streamStatus]);

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(undefined);
      return;
    }
    const exists = selectedSessionId !== undefined && sessions.some((s) => s.sessionId === selectedSessionId);
    if (!exists) {
      setSelectedSessionId(sessions[0]?.sessionId);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }
    if (selectedSessionId === undefined) {
      setSessionReplay(undefined);
      return;
    }
    let active = true;
    const loadReplay = async (): Promise<void> => {
      try {
        const payload = asRecord(await fetchJson(`/api/session/${encodeURIComponent(selectedSessionId)}`));
        if (payload === undefined || readString(payload, "status") !== "ok") {
          throw new Error("session replay payload is invalid");
        }
        const replay = parseReplay(payload["session"]);
        if (!active) return;
        setSessionReplay(replay);
      } catch (error: unknown) {
        if (!active) return;
        setWarning(String(error));
      }
    };
    void loadReplay();
    return () => { active = false; };
  }, [authState, fetchJson, selectedSessionId]);

  useEffect(() => {
    if (authState !== "authenticated" || activeTab !== "team") {
      return;
    }
    let active = true;
    const loadTeam = async (): Promise<void> => {
      try {
        setTeamStatus("Loading team data...");
        const query = rangeToQuery(teamRange);
        const [overviewPayload, membersPayload, costPayload, budgetPayload] = await Promise.all([
          fetchJson(`/api/team/overview?${query}`),
          fetchJson(`/api/team/members?${query}`),
          fetchJson(`/api/team/cost/daily?${query}`),
          fetchJson("/api/team/budget")
        ]);
        if (!active) return;
        setTeamOverview(parseTeamOverview(overviewPayload));
        setTeamMembers(parseTeamMembers(membersPayload));
        setTeamCost(parseTeamCost(costPayload));
        setTeamBudget(parseTeamBudget(budgetPayload));
        setTeamStatus("Live");
      } catch (error: unknown) {
        if (!active) return;
        setTeamStatus(String(error));
      }
    };
    void loadTeam();
    const interval = setInterval(() => {
      void loadTeam();
    }, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeTab, authState, fetchJson, teamRange]);

  useEffect(() => {
    if (authState !== "authenticated" || activeTab !== "insights") {
      return;
    }
    let active = true;
    const loadInsights = async (): Promise<void> => {
      try {
        setInsightsStatus("Loading analytics...");
        const query = rangeToQuery(insightsRange);
        const analyticsPayload = await fetchJson(`/api/team/analytics?${query}`);
        if (!active) return;
        setInsightsSummary(parseInsightsSummary(analyticsPayload));
        setInsightsStatus("Ready");
      } catch (error: unknown) {
        if (!active) return;
        setInsightsStatus(String(error));
      }
    };
    void loadInsights();
    return () => { active = false; };
  }, [activeTab, authState, fetchJson, insightsRange]);

  const loadSaas = useCallback(async (orgId: string): Promise<void> => {
    const month = currentYearMonth();
    const [orgPayload, membersPayload] = await Promise.all([
      fetchJson(`/api/saas/orgs/${encodeURIComponent(orgId)}`),
      fetchJson(`/api/saas/orgs/${encodeURIComponent(orgId)}/members`)
    ]);
    const parsedSnapshot = parseSaasSnapshot(orgPayload);
    let nextSnapshot = parsedSnapshot;
    setSaasMembers(parseSaasMembers(membersPayload));
    setSaasCheckoutUrl("");
    const usagePayload = await fetchJson(`/api/saas/orgs/${encodeURIComponent(orgId)}/usage?month=${month}`);
    const usageRecord = asRecord(usagePayload);
    const usage = usageRecord !== undefined ? asRecord(usageRecord["usage"]) : undefined;
    if (usage !== undefined && nextSnapshot !== undefined) {
      nextSnapshot = {
        ...nextSnapshot,
        currentMonthCostUsd: readNumber(usage, "totalCostUsd") ?? nextSnapshot.currentMonthCostUsd
      };
    }
    setSaasSnapshot(nextSnapshot);
  }, [fetchJson]);

  useEffect(() => {
    if (authState !== "authenticated" || activeTab !== "org" || saasOrgId.length === 0) {
      return;
    }
    void loadSaas(saasOrgId).catch((error: unknown) => {
      setSaasStatus(String(error));
    });
  }, [activeTab, authState, loadSaas, saasOrgId]);

  const totalCost = useMemo(() => sessions.reduce((sum, s) => sum + s.totalCostUsd, 0), [sessions]);
  const promptCount = useMemo(() => sessions.reduce((sum, s) => sum + s.promptCount, 0), [sessions]);
  const toolCallCount = useMemo(() => sessions.reduce((sum, s) => sum + s.toolCallCount, 0), [sessions]);
  const totalCommits = useMemo(() => sessions.reduce((sum, s) => sum + s.commitCount, 0), [sessions]);
  const sessionsWithCommits = useMemo(() => sessions.filter((s) => s.commitCount > 0).length, [sessions]);
  const maxCostPoint = useMemo(() => Math.max(0.01, ...costPoints.map((p) => p.totalCostUsd)), [costPoints]);
  const promptGroups = useMemo(() => {
    if (sessionReplay === undefined) return undefined;
    return buildPromptGroups(sessionReplay.timeline, sessionReplay.commits);
  }, [sessionReplay]);
  const activeSessionInsight = useMemo(
    () => (sessionReplay !== undefined ? sessionInsights[sessionReplay.sessionId] : undefined),
    [sessionInsights, sessionReplay]
  );

  const teamMaxCost = useMemo(
    () => Math.max(0.01, ...teamCost.map((point) => point.totalCostUsd)),
    [teamCost]
  );

  const signIn = useCallback(async (): Promise<void> => {
    try {
      setAuthError("");
      const body = authMode === "token"
        ? { token: authTokenInput }
        : { email: authEmail, password: authPassword };
      const payload = asRecord(await fetchJson("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }));
      if (payload === undefined) {
        throw new Error("invalid auth response");
      }
      if (readString(payload, "status") === "ok") {
        setAuthState("authenticated");
        setAuthError("");
        const user = asRecord(payload["user"]);
        if (user !== undefined) {
          setCurrentUserEmail(readString(user, "email") ?? "");
          setCurrentUserName(readString(user, "displayName") ?? "");
        }
        const organizations = parseAuthOrganizations(payload);
        if (organizations.length > 0) {
          const firstOrg = organizations[0];
          if (firstOrg !== undefined) {
            setSaasOrgId(firstOrg.orgId);
          }
        }
        void loadSettings();
      }
    } catch (error: unknown) {
      setAuthError(String(error));
    }
  }, [authEmail, authMode, authPassword, authTokenInput, fetchJson, loadSettings]);

  const signUp = useCallback(async (): Promise<void> => {
    try {
      setAuthError("");
      const payload = asRecord(await fetchJson("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          displayName: authDisplayName,
          orgName: authOrgName
        })
      }));
      if (payload === undefined || readString(payload, "status") !== "ok") {
        throw new Error("failed to create account");
      }
      setAuthState("authenticated");
      const user = asRecord(payload["user"]);
      if (user !== undefined) {
        setCurrentUserEmail(readString(user, "email") ?? "");
        setCurrentUserName(readString(user, "displayName") ?? "");
      }
      const organizations = parseAuthOrganizations(payload);
      if (organizations.length > 0) {
        const firstOrg = organizations[0];
        if (firstOrg !== undefined) {
          setSaasOrgId(firstOrg.orgId);
        }
      }
      setAuthError("");
      void loadSettings();
    } catch (error: unknown) {
      setAuthError(String(error));
    }
  }, [authDisplayName, authEmail, authOrgName, authPassword, fetchJson, loadSettings]);

  const signOut = useCallback(async (): Promise<void> => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthState(authRequired ? "required" : "authenticated");
    setAuthError("");
    setCurrentUserEmail("");
    setCurrentUserName("");
    setSessionReplay(undefined);
    setSessionInsights({});
    setTeamInsight(undefined);
  }, [authRequired]);

  const saveInsightsSettings = useCallback(async (): Promise<void> => {
    try {
      setSettingsStatus("Saving...");
      const payload = asRecord(await fetchJson("/api/settings/insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider,
          apiKey,
          model
        })
      }));
      if (payload === undefined || readString(payload, "status") !== "ok") {
        throw new Error("failed to save settings");
      }
      setInsightsConfigured(true);
      setSettingsStatus("Saved");
    } catch (error: unknown) {
      setSettingsStatus(String(error));
    }
  }, [apiKey, fetchJson, model, provider]);

  const generateSessionInsight = useCallback(async (): Promise<void> => {
    if (sessionReplay === undefined) {
      return;
    }
    try {
      setSessionInsightStatus("Generating...");
      const payload = await fetchJson(`/api/session/${encodeURIComponent(sessionReplay.sessionId)}/insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      const parsed = parseSessionInsight(payload);
      if (parsed === undefined) {
        throw new Error("insight generation failed");
      }
      setSessionInsights((prev) => ({
        ...prev,
        [sessionReplay.sessionId]: parsed
      }));
      setSessionInsightStatus("Ready");
    } catch (error: unknown) {
      setSessionInsightStatus(String(error));
    }
  }, [fetchJson, sessionReplay]);

  const saveBudget = useCallback(async (): Promise<void> => {
    const limit = Number(budgetLimitInput);
    const threshold = Number(budgetThresholdInput);
    if (!Number.isFinite(limit) || limit < 0) {
      setBudgetStatus("Invalid limit");
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      setBudgetStatus("Invalid threshold");
      return;
    }
    try {
      setBudgetStatus("Saving...");
      await fetchJson("/api/team/budget", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          monthlyLimitUsd: limit,
          alertThresholdPercent: threshold
        })
      });
      setBudgetStatus("Saved");
    } catch (error: unknown) {
      setBudgetStatus(String(error));
    }
  }, [budgetLimitInput, budgetThresholdInput, fetchJson]);

  const generateTeamInsight = useCallback(async (): Promise<void> => {
    try {
      const query = rangeToQuery(insightsRange);
      setTeamInsightStatus("Generating...");
      const payload = await fetchJson(`/api/team/insights/generate?${query}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      const parsed = parseTeamInsight(payload);
      if (parsed === undefined) {
        throw new Error("team insight generation failed");
      }
      setTeamInsight(parsed);
      setTeamInsightStatus("Ready");
    } catch (error: unknown) {
      setTeamInsightStatus(String(error));
    }
  }, [fetchJson, insightsRange]);

  const openContext = useCallback(async (): Promise<void> => {
    try {
      const payload = asRecord(await fetchJson("/api/team/insights/context"));
      const context = payload !== undefined ? asRecord(payload["context"]) : undefined;
      setContextCompany(context !== undefined ? (readString(context, "companyContext") ?? "") : "");
      setContextGuidelines(context !== undefined ? (readString(context, "analysisGuidelines") ?? "") : "");
    } catch {
      setContextCompany("");
      setContextGuidelines("");
    }
    setContextOpen(true);
  }, [fetchJson]);

  const saveContext = useCallback(async (): Promise<void> => {
    try {
      setContextStatus("Saving...");
      await fetchJson("/api/team/insights/context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyContext: contextCompany,
          analysisGuidelines: contextGuidelines
        })
      });
      setContextStatus("Saved");
    } catch (error: unknown) {
      setContextStatus(String(error));
    }
  }, [contextCompany, contextGuidelines, fetchJson]);

  const createSaasOrg = useCallback(async (): Promise<void> => {
    const seatLimit = Number(saasSeatLimit);
    const trialDays = Number(saasTrialDays);
    if (saasName.trim().length === 0 || saasEmail.trim().length === 0) {
      setSaasStatus("Name and billing email are required");
      return;
    }
    if (!Number.isFinite(seatLimit) || seatLimit <= 0) {
      setSaasStatus("Seat limit must be positive");
      return;
    }
    try {
      setSaasStatus("Creating organization...");
      const payload = asRecord(await fetchJson("/api/saas/orgs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: saasName.trim(),
          billingEmail: saasEmail.trim(),
          plan: saasPlan,
          seatLimit: Math.trunc(seatLimit),
          ...(Number.isFinite(trialDays) ? { trialDays: Math.max(0, Math.trunc(trialDays)) } : {})
        })
      }));
      if (payload === undefined || readString(payload, "status") !== "ok") {
        throw new Error("failed to create organization");
      }
      const snapshot = parseSaasSnapshot(payload);
      if (snapshot === undefined) {
        throw new Error("missing organization snapshot");
      }
      const onboarding = asRecord(payload["onboarding"]);
      const createdKey = onboarding !== undefined ? readString(onboarding, "apiKey") : undefined;
      setSaasOrgId(snapshot.orgId);
      setSaasSnapshot(snapshot);
      setSaasApiKey(createdKey ?? "");
      setSaasStatus("Organization created");
      void loadSaas(snapshot.orgId);
    } catch (error: unknown) {
      setSaasStatus(String(error));
    }
  }, [fetchJson, loadSaas, saasEmail, saasName, saasPlan, saasSeatLimit, saasTrialDays]);

  const addSaasMember = useCallback(async (): Promise<void> => {
    if (saasOrgId.length === 0 || saasMemberUserId.trim().length === 0) {
      return;
    }
    try {
      setSaasStatus("Adding member...");
      await fetchJson(`/api/saas/orgs/${encodeURIComponent(saasOrgId)}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: saasMemberUserId.trim(),
          userEmail: saasMemberUserId.trim(),
          role: saasMemberRole,
          status: "active"
        })
      });
      setSaasMemberUserId("");
      setSaasStatus("Member added");
      await loadSaas(saasOrgId);
    } catch (error: unknown) {
      setSaasStatus(String(error));
    }
  }, [fetchJson, loadSaas, saasMemberRole, saasMemberUserId, saasOrgId]);

  const createCheckout = useCallback(async (): Promise<void> => {
    if (saasOrgId.length === 0) return;
    try {
      setSaasStatus("Generating checkout link...");
      const payload = asRecord(await fetchJson(`/api/saas/orgs/${encodeURIComponent(saasOrgId)}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          plan: saasPlan,
          seatLimit: Number(saasSeatLimit)
        })
      }));
      const url = payload !== undefined ? readString(payload, "checkoutUrl") : undefined;
      if (url === undefined) {
        throw new Error("checkout URL not available");
      }
      setSaasCheckoutUrl(url);
      setSaasStatus("Checkout link ready");
    } catch (error: unknown) {
      setSaasStatus(String(error));
    }
  }, [fetchJson, saasOrgId, saasPlan, saasSeatLimit]);

  if (authState === "checking") {
    return (
      <main className="dashboard-shell">
        <section className="hero">
          <h1 className="hero-title">agent-trace</h1>
          <p className="hero-subtitle">session observability for coding agents</p>
          <div className="status-banner">Checking authentication...</div>
        </section>
      </main>
    );
  }

  if (authState === "required") {
    return (
      <main className="dashboard-shell">
        <section className="hero">
          <h1 className="hero-title">agent-trace</h1>
          <p className="hero-subtitle">session observability for coding agents</p>
        </section>
        <section className="auth-gate">
          <h2>{authMode === "signup" ? "Create Account" : "Sign In"}</h2>
          <p>
            {authMode === "token"
              ? "Use your team access token."
              : authMode === "signup"
                ? "Create your account and start with a free trial org."
                : "Sign in with your account credentials."}
          </p>
          <div className="auth-mode-tabs">
            <button
              className={`tab-btn${authMode === "signin" ? " active" : ""}`}
              onClick={() => setAuthMode("signin")}
            >
              Sign In
            </button>
            <button
              className={`tab-btn${authMode === "signup" ? " active" : ""}`}
              onClick={() => setAuthMode("signup")}
            >
              Sign Up
            </button>
            <button
              className={`tab-btn${authMode === "token" ? " active" : ""}`}
              onClick={() => setAuthMode("token")}
            >
              Token
            </button>
          </div>
          {authMode === "token" ? (
            <>
              <input
                type="password"
                value={authTokenInput}
                placeholder="Enter team auth token..."
                onChange={(event) => setAuthTokenInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void signIn();
                  }
                }}
              />
              <button onClick={() => { void signIn(); }}>Sign In With Token</button>
            </>
          ) : (
            <>
              <input
                type="email"
                value={authEmail}
                placeholder="Email"
                onChange={(event) => setAuthEmail(event.target.value)}
              />
              <input
                type="password"
                value={authPassword}
                placeholder="Password"
                onChange={(event) => setAuthPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    if (authMode === "signup") {
                      void signUp();
                    } else {
                      void signIn();
                    }
                  }
                }}
              />
              {authMode === "signup" && (
                <>
                  <input
                    type="text"
                    value={authDisplayName}
                    placeholder="Your name (optional)"
                    onChange={(event) => setAuthDisplayName(event.target.value)}
                  />
                  <input
                    type="text"
                    value={authOrgName}
                    placeholder="Organization name (optional)"
                    onChange={(event) => setAuthOrgName(event.target.value)}
                  />
                </>
              )}
              <button onClick={() => { void (authMode === "signup" ? signUp() : signIn()); }}>
                {authMode === "signup" ? "Create Account" : "Sign In"}
              </button>
            </>
          )}
          {authError.length > 0 && <div className="auth-error">{authError}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <section className="hero" style={{ position: "relative" }}>
        <h1 className="hero-title">agent-trace</h1>
        <p className="hero-subtitle">Session observability for coding agents</p>
        <div className="hero-actions">
          {currentUserEmail.length > 0 && (
            <span className="user-pill">
              {currentUserName.length > 0 ? currentUserName : currentUserEmail}
            </span>
          )}
          <button className="settings-btn" onClick={() => { setSettingsOpen(true); void loadSettings(); }}>AI Settings</button>
          {authRequired && <button className="logout-btn" onClick={() => { void signOut(); }}>Sign Out</button>}
        </div>
        {(warning !== undefined || statusMessage !== undefined) && (
          <div className={`status-banner${warning !== undefined ? " warning" : ""}`}>
            {warning ?? statusMessage}
          </div>
        )}
      </section>

      <div className="tab-bar">
        <button className={`tab-btn${activeTab === "sessions" ? " active" : ""}`} onClick={() => setActiveTab("sessions")}>
          Sessions
        </button>
        <button className={`tab-btn${activeTab === "team" ? " active" : ""}`} onClick={() => setActiveTab("team")}>
          Team
        </button>
        <button className={`tab-btn${activeTab === "insights" ? " active" : ""}`} onClick={() => setActiveTab("insights")}>
          Insights
        </button>
        <button className={`tab-btn${activeTab === "org" ? " active" : ""}`} onClick={() => setActiveTab("org")}>
          Organization
        </button>
      </div>

      <section className={`tab-content${activeTab === "sessions" ? " active" : ""}`}>
        <section className="metrics-grid">
          <article className="metric-card">
            <div className="metric-label">Sessions</div>
            <div className="metric-value green">{String(sessions.length)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Total Cost</div>
            <div className="metric-value orange">{formatMoneyShort(totalCost)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Prompts</div>
            <div className="metric-value cyan">{String(promptCount)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Tool Calls</div>
            <div className="metric-value">{String(toolCallCount)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Commits</div>
            <div className="metric-value green">{String(totalCommits)}</div>
            <div className="metric-detail">
              {String(sessionsWithCommits)}/{String(sessions.length)} sessions produced commits
            </div>
          </article>
        </section>

        <section className="section-grid">
          <section className="panel">
            <header className="panel-header">
              <div>
                <h2 className="panel-title">Sessions</h2>
                <p className="panel-subtitle">
                  {streamStatus === "live" ? "live" : streamStatus === "polling" ? "polling" : "..."}
                </p>
              </div>
            </header>
            <div className="panel-content">
              {sessions.length === 0 ? (
                <div className="empty-state">No sessions captured yet.</div>
              ) : (
                <table className="session-table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Repo</th>
                      <th>Started</th>
                      <th>Prompts</th>
                      <th>Cost</th>
                      <th>Commits</th>
                      <th>Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr
                        key={session.sessionId}
                        className={`session-row${session.sessionId === selectedSessionId ? " active" : ""}`}
                        onClick={() => setSelectedSessionId(session.sessionId)}
                      >
                        <td>{session.sessionId.slice(0, 10)}</td>
                        <td className="repo-cell">
                          {session.gitRepo !== null
                            ? session.gitBranch !== null
                              ? `${session.gitRepo}/${session.gitBranch}`
                              : session.gitRepo
                            : "-"}
                        </td>
                        <td>{formatDate(session.startedAt)}</td>
                        <td>{String(session.promptCount)}</td>
                        <td>{formatMoneyShort(session.totalCostUsd)}</td>
                        <td>
                          {session.commitCount > 0
                            ? <span className="badge green">{String(session.commitCount)}</span>
                            : <span className="badge dim">0</span>}
                        </td>
                        <td>
                          {(session.linesAdded > 0 || session.linesRemoved > 0)
                            ? <>
                                <span className="line-stat green">+{String(session.linesAdded)}</span>
                                <span className="line-stat red">-{String(session.linesRemoved)}</span>
                              </>
                            : <span style={{ color: "var(--text-dim)" }}>-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2 className="panel-title">Daily Cost</h2>
                <p className="panel-subtitle">7-day spend</p>
              </div>
            </header>
            <div className="panel-content">
              {costPoints.length === 0 ? (
                <div className="empty-state">No cost data yet.</div>
              ) : (
                <div className="chart">
                  {costPoints.slice(-7).map((point) => (
                    <div key={point.date} className="chart-col">
                      <div
                        className="chart-bar"
                        style={{
                          height: `${String(Math.max(4, Math.round((point.totalCostUsd / maxCostPoint) * 140)))}px`
                        }}
                      />
                      <div className="chart-value">{formatMoneyShort(point.totalCostUsd)}</div>
                      <div className="chart-label">{point.date.slice(5)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="panel" style={{ marginTop: "10px" }}>
          <header className="panel-header">
            <div>
              <h2 className="panel-title">Session Replay</h2>
              <p className="panel-subtitle">
                {selectedSessionId === undefined
                  ? "select a session"
                  : `${selectedSessionId.slice(0, 12)} — ${String(sessionReplay?.metrics.promptCount ?? 0)} prompts, ${formatMoneyShort(sessionReplay?.metrics.totalCostUsd ?? 0)}`}
              </p>
            </div>
          </header>
          <div className="panel-content">
            {sessionReplay === undefined ? (
              <div className="empty-state">No replay data for this session.</div>
            ) : (
              <>
                <div className="timeline-meta">
                  <span className="timeline-meta-item">
                    Cost <span className="badge orange">{formatMoney(sessionReplay.metrics.totalCostUsd)}</span>
                  </span>
                  <span className="timeline-meta-item">
                    Tokens <span className="badge cyan">
                      {String(sessionReplay.metrics.totalInputTokens)} in / {String(sessionReplay.metrics.totalOutputTokens)} out
                    </span>
                  </span>
                  {(sessionReplay.metrics.totalCacheReadTokens > 0 || sessionReplay.metrics.totalCacheWriteTokens > 0) && (
                    <span className="timeline-meta-item">
                      Cache <span className="badge purple">
                        {String(sessionReplay.metrics.totalCacheReadTokens)} read / {String(sessionReplay.metrics.totalCacheWriteTokens)} write
                      </span>
                    </span>
                  )}
                </div>

                <div className="insight-panel">
                  <div className="insight-hd">
                    <span className="insight-title">AI Insight</span>
                    {insightsConfigured && (
                      <button className="insight-gen-btn" onClick={() => { void generateSessionInsight(); }}>
                        Generate Insight
                      </button>
                    )}
                  </div>
                  {!insightsConfigured && (
                    <div className="insight-error">Configure AI settings first.</div>
                  )}
                  {sessionInsightStatus.length > 0 && (
                    <div className="insight-loading">{sessionInsightStatus}</div>
                  )}
                  {activeSessionInsight !== undefined && (
                    <>
                      <div className="insight-summary">{activeSessionInsight.summary}</div>
                      {activeSessionInsight.highlights.map((item) => (
                        <div key={`highlight-${item}`} className="insight-item">{item}</div>
                      ))}
                      {activeSessionInsight.suggestions.map((item) => (
                        <div key={`suggestion-${item}`} className="insight-item">{item}</div>
                      ))}
                      {activeSessionInsight.costNote !== undefined && (
                        <div className="insight-cost">{activeSessionInsight.costNote}</div>
                      )}
                    </>
                  )}
                </div>

                {(sessionReplay.commits.length > 0 || sessionReplay.pullRequests.length > 0 || sessionReplay.gitBranch !== undefined) && (
                  <div className="outcome-section">
                    <div className="outcome-header">Outcome</div>
                    <div className="outcome-row">
                      {sessionReplay.gitBranch !== undefined && (
                        <span className="outcome-item">
                          <span className="outcome-label">branch</span>
                          <span className="outcome-value">{sessionReplay.gitBranch}</span>
                        </span>
                      )}
                      {sessionReplay.commits.length > 0 && (
                        <span className="outcome-item">
                          <span className="outcome-label">{sessionReplay.commits.length === 1 ? "commit" : "commits"}</span>
                          <span className="outcome-value">{String(sessionReplay.commits.length)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {promptGroups === undefined || promptGroups.groups.length === 0 ? (
                  <div className="empty-state">No prompts in this session.</div>
                ) : (
                  promptGroups.groups.map((group, i) => (
                    <PromptCard key={group.promptId} group={group} index={i + 1} />
                  ))
                )}
              </>
            )}
          </div>
        </section>
      </section>

      <section className={`tab-content${activeTab === "team" ? " active" : ""}`}>
        <section className="metrics-grid">
          <article className="metric-card">
            <div className="metric-label">Members</div>
            <div className="metric-value cyan">{String(teamOverview?.memberCount ?? 0)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Team Cost</div>
            <div className="metric-value orange">{formatMoneyShort(teamOverview?.totalCostUsd ?? 0)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Sessions</div>
            <div className="metric-value green">{String(teamOverview?.totalSessions ?? 0)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Commits</div>
            <div className="metric-value green">{String(teamOverview?.totalCommits ?? 0)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">$/Commit</div>
            <div className="metric-value">{formatMoneyShort(teamOverview?.costPerCommit ?? 0)}</div>
          </article>
        </section>

        {teamBudget !== undefined && (
          <section className="budget-bar">
            <div className="budget-label">
              <span>
                {`${Math.round(teamBudget.percentUsed)}% of ${formatMoneyShort(teamBudget.monthlyLimitUsd)} budget`}
              </span>
            </div>
            <div className="budget-track">
              <div
                className={`budget-fill ${
                  teamBudget.percentUsed >= 100 ? "red"
                    : teamBudget.percentUsed >= teamBudget.alertThresholdPercent ? "orange"
                    : "green"
                }`}
                style={{ width: `${String(Math.min(teamBudget.percentUsed, 100))}%` }}
              />
            </div>
            <div className="budget-actions">
              <input
                type="number"
                value={budgetLimitInput}
                placeholder={String(teamBudget.monthlyLimitUsd)}
                onChange={(event) => setBudgetLimitInput(event.target.value)}
              />
              <input
                type="number"
                value={budgetThresholdInput}
                onChange={(event) => setBudgetThresholdInput(event.target.value)}
              />
              <button className="insight-gen-btn" onClick={() => { void saveBudget(); }}>Save Budget</button>
              <span className="team-status">{budgetStatus}</span>
            </div>
          </section>
        )}

        <section className="section-grid">
          <section className="panel">
            <header className="panel-header">
              <div>
                <h2 className="panel-title">Team Members</h2>
                <p className="panel-subtitle">{teamOverview?.periodLabel ?? "current range"}</p>
              </div>
              <div className="time-range">
                <button className={`time-range-btn${teamRange === "week" ? " active" : ""}`} onClick={() => setTeamRange("week")}>This week</button>
                <button className={`time-range-btn${teamRange === "month" ? " active" : ""}`} onClick={() => setTeamRange("month")}>This month</button>
                <button className={`time-range-btn${teamRange === "30d" ? " active" : ""}`} onClick={() => setTeamRange("30d")}>Last 30 days</button>
              </div>
            </header>
            <div className="panel-content">
              {teamMembers.length === 0 ? (
                <div className="empty-state">{teamStatus.length > 0 ? teamStatus : "No team data yet."}</div>
              ) : (
                <table className="team-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Sessions</th>
                      <th>Cost</th>
                      <th>Commits</th>
                      <th>Lines</th>
                      <th>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.userId} className="team-row">
                        <td>
                          {member.displayName ?? member.userId}
                          {member.displayName !== null && member.displayName !== member.userId && (
                            <div className="member-sub">{member.userId}</div>
                          )}
                        </td>
                        <td>{String(member.sessionCount)}</td>
                        <td className="orange">{formatMoneyShort(member.totalCostUsd)}</td>
                        <td>{String(member.commitCount)}</td>
                        <td>
                          <span className="line-stat green">+{String(member.linesAdded)}</span>
                          <span className="line-stat red">-{String(member.linesRemoved)}</span>
                        </td>
                        <td>{member.lastActiveAt.length > 0 ? formatDate(member.lastActiveAt) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2 className="panel-title">Team Daily Cost</h2>
                <p className="panel-subtitle">cost trend by day</p>
              </div>
            </header>
            <div className="panel-content">
              {teamCost.length === 0 ? (
                <div className="empty-state">No cost data.</div>
              ) : (
                <div className="chart">
                  {teamCost.slice(-7).map((point) => (
                    <div key={point.date} className="chart-col">
                      <div
                        className="chart-bar"
                        style={{ height: `${String(Math.max(4, Math.round((point.totalCostUsd / teamMaxCost) * 140)))}px` }}
                      />
                      <div className="chart-value">{formatMoneyShort(point.totalCostUsd)}</div>
                      <div className="chart-label">{point.date.slice(5)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      </section>

      <section className={`tab-content${activeTab === "insights" ? " active" : ""}`}>
        <section className="metrics-grid">
          <article className="metric-card"><div className="metric-label">Avg $/Session</div><div className="metric-value orange">{formatMoneyShort(insightsSummary?.avgCostPerSession ?? 0)}</div></article>
          <article className="metric-card"><div className="metric-label">Avg Commits/Session</div><div className="metric-value green">{(insightsSummary?.avgCommitsPerSession ?? 0).toFixed(2)}</div></article>
          <article className="metric-card"><div className="metric-label">$/Commit</div><div className="metric-value cyan">{formatMoneyShort(insightsSummary?.avgCostPerCommit ?? 0)}</div></article>
          <article className="metric-card"><div className="metric-label">Total Tokens</div><div className="metric-value purple">{String(insightsSummary?.totalTokensUsed ?? 0)}</div></article>
          <article className="metric-card"><div className="metric-label">Efficiency</div><div className="metric-value green">{String(Math.round(insightsSummary?.costEfficiencyScore ?? 0))}</div></article>
        </section>

        <section className="panel" style={{ marginTop: "10px" }}>
          <header className="panel-header">
            <div>
              <h2 className="panel-title">Team Analytics</h2>
              <p className="panel-subtitle">{insightsSummary?.periodLabel ?? insightsStatus}</p>
            </div>
            <div className="time-range">
              <button className={`time-range-btn${insightsRange === "week" ? " active" : ""}`} onClick={() => setInsightsRange("week")}>This week</button>
              <button className={`time-range-btn${insightsRange === "month" ? " active" : ""}`} onClick={() => setInsightsRange("month")}>This month</button>
              <button className={`time-range-btn${insightsRange === "30d" ? " active" : ""}`} onClick={() => setInsightsRange("30d")}>Last 30 days</button>
            </div>
          </header>
          <div className="panel-content insight-grid">
            <div>
              <div className="panel-subtitle">Top Models</div>
              {(insightsSummary?.topModels ?? []).map((model) => (
                <div key={model.model} className="insight-item-row">
                  <span>{model.model}</span>
                  <span>{formatMoneyShort(model.totalCostUsd)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="panel-subtitle">Top Tools</div>
              {(insightsSummary?.topTools ?? []).map((tool) => (
                <div key={tool.tool} className="insight-item-row">
                  <span>{tool.tool}</span>
                  <span>{String(tool.callCount)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ins-ai-panel">
          <div className="ins-ai-header">
            <div className="ins-ai-title">AI Team Analysis</div>
            <div>
              <button className="configure-analysis-btn" onClick={() => { void openContext(); }}>Configure Analysis</button>
              <button className="insight-gen-btn" style={{ marginLeft: "8px" }} onClick={() => { void generateTeamInsight(); }}>
                Generate Team Analysis
              </button>
            </div>
          </div>
          {teamInsightStatus.length > 0 && <div className="insight-loading">{teamInsightStatus}</div>}
          {teamInsight !== undefined && (
            <div className="ins-ai-body">
              <div className="ins-ai-section">
                <h4>Executive Summary</h4>
                <div>{teamInsight.executiveSummary}</div>
              </div>
              <div className="ins-ai-section">
                <h4>Cost Analysis</h4>
                <div>{teamInsight.costAnalysis}</div>
              </div>
              <div className="ins-ai-section">
                <h4>Productivity Analysis</h4>
                <div>{teamInsight.productivityAnalysis}</div>
              </div>
              {teamInsight.recommendations.map((item) => (
                <div key={`rec-${item}`} className="ins-ai-item">{item}</div>
              ))}
              {teamInsight.risks.map((item) => (
                <div key={`risk-${item}`} className="ins-ai-item">{item}</div>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className={`tab-content${activeTab === "org" ? " active" : ""}`}>
        <section className="free-trial-banner">
          Free trial is enabled. New signups are provisioned with trial access automatically.
        </section>

        {saasSnapshot === undefined ? (
          <section className="panel" style={{ marginTop: "10px" }}>
            <header className="panel-header">
              <div>
                <h2 className="panel-title">Create Organization</h2>
                <p className="panel-subtitle">Set up your organization workspace</p>
              </div>
            </header>
            <div className="panel-content saas-form">
              <input value={saasName} onChange={(event) => setSaasName(event.target.value)} placeholder="Organization name" />
              <input value={saasEmail} onChange={(event) => setSaasEmail(event.target.value)} placeholder="Billing email" />
              <select value={saasPlan} onChange={(event) => setSaasPlan(event.target.value)}>
                <option value="starter">starter</option>
                <option value="team">team</option>
                <option value="enterprise">enterprise</option>
                <option value="oss">oss</option>
              </select>
              <input value={saasSeatLimit} onChange={(event) => setSaasSeatLimit(event.target.value)} type="number" placeholder="Seat limit" />
              <input value={saasTrialDays} onChange={(event) => setSaasTrialDays(event.target.value)} type="number" placeholder="Trial days" />
              <button className="insight-gen-btn" onClick={() => { void createSaasOrg(); }}>Create Organization</button>
              {saasStatus.length > 0 && <div className="team-status">{saasStatus}</div>}
            </div>
          </section>
        ) : (
          <>
            <section className="metrics-grid" style={{ marginTop: "10px" }}>
              <article className="metric-card"><div className="metric-label">Organization</div><div className="metric-value">{saasSnapshot.name}</div><div className="metric-detail">{saasSnapshot.slug}</div></article>
              <article className="metric-card"><div className="metric-label">Plan</div><div className="metric-value cyan">{saasSnapshot.plan}</div><div className="metric-detail">{saasSnapshot.subscriptionStatus}</div></article>
              <article className="metric-card"><div className="metric-label">Seats</div><div className="metric-value green">{String(saasSnapshot.activeMemberCount)}/{String(saasSnapshot.seatLimit)}</div><div className="metric-detail">{saasSnapshot.seatUtilizationPercent.toFixed(1)}%</div></article>
              <article className="metric-card"><div className="metric-label">Month Cost</div><div className="metric-value orange">{formatMoneyShort(saasSnapshot.currentMonthCostUsd)}</div></article>
              <article className="metric-card"><div className="metric-label">Trial Ends</div><div className="metric-value purple">{saasSnapshot.trialEndsAt !== null ? formatDate(saasSnapshot.trialEndsAt) : "-"}</div></article>
            </section>

            <section className="section-grid">
              <section className="panel">
                <header className="panel-header">
                  <div>
                    <h2 className="panel-title">Members</h2>
                    <p className="panel-subtitle">{String(saasSnapshot.memberCount)} total members</p>
                  </div>
                </header>
                <div className="panel-content">
                  <div className="saas-member-form">
                    <input value={saasMemberUserId} onChange={(event) => setSaasMemberUserId(event.target.value)} placeholder="user email" />
                    <select value={saasMemberRole} onChange={(event) => setSaasMemberRole(event.target.value)}>
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button className="insight-gen-btn" onClick={() => { void addSaasMember(); }}>Add</button>
                  </div>
                  {saasMembers.length === 0 ? (
                    <div className="empty-state">No members yet.</div>
                  ) : (
                    <table className="team-table">
                      <thead>
                        <tr><th>User</th><th>Role</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {saasMembers.map((member) => (
                          <tr key={member.userId} className="team-row">
                            <td>{member.userId}</td>
                            <td>{member.role}</td>
                            <td>{member.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              <section className="panel">
                <header className="panel-header">
                  <div>
                    <h2 className="panel-title">Billing</h2>
                    <p className="panel-subtitle">Checkout and API keys</p>
                  </div>
                </header>
                <div className="panel-content saas-form">
                  <div className="api-key-preview">Org API key: {saasApiKey.length > 0 ? saasApiKey : "not shown"}</div>
                  <button className="insight-gen-btn" onClick={() => { void createCheckout(); }}>Create Checkout Link</button>
                  {saasCheckoutUrl.length > 0 && (
                    <a href={saasCheckoutUrl} target="_blank" rel="noopener noreferrer" className="checkout-link">
                      {saasCheckoutUrl}
                    </a>
                  )}
                  {saasStatus.length > 0 && <div className="team-status">{saasStatus}</div>}
                </div>
              </section>
            </section>
          </>
        )}
      </section>

      {settingsOpen && (
        <div className="modal-overlay open">
          <div className="modal">
            <button className="modal-close" onClick={() => setSettingsOpen(false)}>&times;</button>
            <h3>AI Insights Settings</h3>
            <label>Provider</label>
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            <label>API Key</label>
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." />
            <label>Model (optional)</label>
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="leave blank for default" />
            <div className="modal-actions">
              <button className="modal-save" onClick={() => { void saveInsightsSettings(); }}>Save</button>
              <span className={`modal-status${settingsStatus === "Saved" ? " ok" : settingsStatus.length > 0 && settingsStatus !== "Saving..." ? " error" : ""}`}>
                {settingsStatus}
              </span>
            </div>
          </div>
        </div>
      )}

      {contextOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ width: "520px" }}>
            <button className="modal-close" onClick={() => setContextOpen(false)}>&times;</button>
            <h3>Configure Team Analysis</h3>
            <label>Company Context</label>
            <textarea value={contextCompany} onChange={(event) => setContextCompany(event.target.value)} rows={5} />
            <label>Analysis Guidelines</label>
            <textarea value={contextGuidelines} onChange={(event) => setContextGuidelines(event.target.value)} rows={5} />
            <div className="modal-actions">
              <button className="modal-save" onClick={() => { void saveContext(); }}>Save</button>
              <span className={`modal-status${contextStatus === "Saved" ? " ok" : contextStatus.length > 0 && contextStatus !== "Saving..." ? " error" : ""}`}>
                {contextStatus}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

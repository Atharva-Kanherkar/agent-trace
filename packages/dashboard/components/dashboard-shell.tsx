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
  readonly totalCostUsd: number;
  readonly totalToolCalls: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
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
    totalCostUsd: readNumber(record, "totalCostUsd") ?? 0
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
  const gitRecord = asRecord(record["git"]);
  const commitsRaw = gitRecord !== undefined && Array.isArray(gitRecord["commits"]) ? gitRecord["commits"] : [];
  const commits: UiSessionCommit[] = commitsRaw
    .map((entry) => {
      const c = asRecord(entry);
      if (c === undefined) return undefined;
      const sha = readString(c, "sha");
      if (sha === undefined) return undefined;
      return {
        sha,
        ...(readString(c, "message") !== undefined ? { message: readString(c, "message") } : {}),
        ...(readString(c, "promptId") !== undefined ? { promptId: readString(c, "promptId") } : {}),
        ...(readString(c, "committedAt") !== undefined ? { committedAt: readString(c, "committedAt") } : {})
      };
    })
    .filter((entry): entry is UiSessionCommit => entry !== undefined);

  return {
    sessionId, startedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    metrics: {
      promptCount: readNumber(metrics, "promptCount") ?? 0,
      toolCallCount: readNumber(metrics, "toolCallCount") ?? 0,
      totalCostUsd: readNumber(metrics, "totalCostUsd") ?? 0,
      totalInputTokens: readNumber(metrics, "totalInputTokens") ?? 0,
      totalOutputTokens: readNumber(metrics, "totalOutputTokens") ?? 0,
      linesAdded: readNumber(metrics, "linesAdded") ?? 0,
      linesRemoved: readNumber(metrics, "linesRemoved") ?? 0,
      modelsUsed: readStringArray(metrics, "modelsUsed"),
      toolsUsed: readStringArray(metrics, "toolsUsed"),
      filesTouched: readStringArray(metrics, "filesTouched")
    },
    commits,
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
        return {
          id, type, timestamp,
          ...(readString(event, "promptId") !== undefined ? { promptId: readString(event, "promptId") } : {}),
          ...(readString(event, "status") !== undefined ? { status: readString(event, "status") } : {}),
          ...(readNumber(event, "costUsd") !== undefined ? { costUsd: readNumber(event, "costUsd") } : {}),
          ...(toolName !== undefined ? { toolName } : {}),
          ...(toolDurationMs !== undefined ? { toolDurationMs } : {}),
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
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

function buildPromptGroups(timeline: readonly UiSessionReplayEvent[]): {
  groups: readonly PromptGroup[];
} {
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
      totalCostUsd, totalToolCalls, totalInputTokens, totalOutputTokens, totalDurationMs,
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

export function DashboardShell(props: DashboardShellProps): ReactElement {
  const [sessions, setSessions] = useState<readonly UiSessionSummary[]>(props.initialSessions);
  const [costPoints, setCostPoints] = useState<readonly UiCostDailyPoint[]>(props.initialCostPoints);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(
    props.initialSessions[0]?.sessionId
  );
  const [sessionReplay, setSessionReplay] = useState<UiSessionReplay | undefined>(undefined);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState<string>("Connecting...");
  const [warning, setWarning] = useState<string | undefined>(props.initialWarning);

  const totalCost = useMemo(() => sessions.reduce((sum, s) => sum + s.totalCostUsd, 0), [sessions]);
  const promptCount = useMemo(() => sessions.reduce((sum, s) => sum + s.promptCount, 0), [sessions]);
  const toolCallCount = useMemo(() => sessions.reduce((sum, s) => sum + s.toolCallCount, 0), [sessions]);
  const maxCostPoint = useMemo(() => Math.max(0.01, ...costPoints.map((p) => p.totalCostUsd)), [costPoints]);
  const promptGroups = useMemo(() => {
    if (sessionReplay === undefined) return undefined;
    return buildPromptGroups(sessionReplay.timeline);
  }, [sessionReplay]);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | undefined;

    const loadSnapshot = async (): Promise<void> => {
      try {
        const [sessionsResponse, costResponse] = await Promise.all([
          fetch("/api/sessions", { cache: "no-store" }),
          fetch("/api/analytics/cost/daily", { cache: "no-store" })
        ]);
        if (!sessionsResponse.ok) throw new Error(`sessions snapshot failed (${String(sessionsResponse.status)})`);
        if (!costResponse.ok) throw new Error(`cost snapshot failed (${String(costResponse.status)})`);

        const sessionsPayload = asRecord((await sessionsResponse.json()) as unknown);
        const costPayload = asRecord((await costResponse.json()) as unknown);
        if (sessionsPayload === undefined || costPayload === undefined) throw new Error("snapshot payload is invalid");

        const sessionsRaw = sessionsPayload["sessions"];
        const pointsRaw = costPayload["points"];
        if (!Array.isArray(sessionsRaw) || !Array.isArray(pointsRaw)) throw new Error("snapshot arrays are missing");

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
        if (streamStatus === "error") {
          setStreamStatus("polling");
          setStatusMessage("Polling every 15s");
        }
      } catch (error: unknown) {
        if (!active) return;
        setWarning(String(error));
        setStreamStatus("error");
        setStatusMessage("Refresh failed");
      }
    };

    void loadSnapshot();
    const interval = setInterval(() => { void loadSnapshot(); }, 15000);

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
      eventSource.addEventListener("bridge_error", (event) => {
        const message = event as MessageEvent<string>;
        if (!active) return;
        setStreamStatus("error");
        setStatusMessage(`Bridge error: ${message.data}`);
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
      if (eventSource !== undefined) eventSource.close();
    };
  }, [streamStatus]);

  useEffect(() => {
    if (sessions.length === 0) { setSelectedSessionId(undefined); return; }
    const exists = selectedSessionId !== undefined && sessions.some((s) => s.sessionId === selectedSessionId);
    if (!exists) setSelectedSessionId(sessions[0]?.sessionId);
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId === undefined) { setSessionReplay(undefined); return; }
    let active = true;
    const loadReplay = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/session/${encodeURIComponent(selectedSessionId)}`, { cache: "no-store" });
        if (response.status === 404) { if (active) setSessionReplay(undefined); return; }
        if (!response.ok) throw new Error(`replay request failed (${String(response.status)})`);
        const payload = asRecord((await response.json()) as unknown);
        if (payload === undefined || readString(payload, "status") !== "ok") throw new Error("replay payload is invalid");
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
  }, [selectedSessionId]);

  return (
    <main className="dashboard-shell">
      <section className="hero">
        <h1 className="hero-title">agent-trace</h1>
        <p className="hero-subtitle">session observability for coding agents</p>
        {(warning !== undefined || statusMessage !== undefined) && (
          <div className={`status-banner${warning !== undefined ? " warning" : ""}`}>
            {warning ?? statusMessage}
          </div>
        )}
      </section>

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
                    <th>User</th>
                    <th>Repo</th>
                    <th>Started</th>
                    <th>Cost</th>
                    <th>Prompts</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.sessionId}
                      className={`session-row${session.sessionId === selectedSessionId ? " active" : ""}`}
                      onClick={() => setSelectedSessionId(session.sessionId)}
                    >
                      <td>{session.sessionId.slice(0, 12)}</td>
                      <td>{session.userId}</td>
                      <td>{session.gitRepo ?? "-"}</td>
                      <td>{formatDate(session.startedAt)}</td>
                      <td>{formatMoneyShort(session.totalCostUsd)}</td>
                      <td>{String(session.promptCount)}</td>
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
                {(sessionReplay.metrics.linesAdded > 0 || sessionReplay.metrics.linesRemoved > 0) && (
                  <span className="timeline-meta-item">
                    Lines <span className="badge green">+{String(sessionReplay.metrics.linesAdded)}</span>
                    {" "}<span className="badge red">-{String(sessionReplay.metrics.linesRemoved)}</span>
                  </span>
                )}
                {sessionReplay.metrics.modelsUsed.length > 0 && (
                  <span className="timeline-meta-item">
                    {sessionReplay.metrics.modelsUsed.join(", ")}
                  </span>
                )}
                {sessionReplay.metrics.filesTouched.length > 0 && (
                  <span className="timeline-meta-item">
                    {String(sessionReplay.metrics.filesTouched.length)} files
                  </span>
                )}
              </div>

              {sessionReplay.commits.length > 0 && (
                <div className="commits-section">
                  <div className="commits-title">
                    Commits ({String(sessionReplay.commits.length)})
                  </div>
                  <table className="timeline-table">
                    <thead>
                      <tr>
                        <th>SHA</th>
                        <th>Message</th>
                        <th>Prompt</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionReplay.commits.map((commit) => (
                        <tr key={commit.sha}>
                          <td>{commit.sha.slice(0, 8)}</td>
                          <td>{commit.message ?? "-"}</td>
                          <td>{commit.promptId !== undefined ? commit.promptId.slice(0, 8) : "-"}</td>
                          <td>{commit.committedAt !== undefined ? formatDate(commit.committedAt) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
    </main>
  );
}

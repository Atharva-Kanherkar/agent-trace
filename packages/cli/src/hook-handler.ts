import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import type { EventEnvelope } from "../../schema/src/types";
import { FileCliConfigStore } from "./config-store";
import type {
  CollectorHttpClient,
  CollectorHttpPostResult,
  CliConfigStore,
  HookForwardInput,
  HookForwardResult,
  HookGitContextProvider,
  HookGitContextRequest,
  HookGitRepositoryState,
  HookHandlerInput,
  HookHandlerResult,
  HookPayload,
  PrivacyTier
} from "./types";

function isIsoDate(value: string): boolean {
  if (Number.isNaN(Date.parse(value))) {
    return false;
  }
  return value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
}

function parseHookPayload(rawStdin: string): HookPayload | undefined {
  const trimmed = rawStdin.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  return parsed as HookPayload;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): readonly string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const output: string[] = [];
  value.forEach((item) => {
    if (typeof item === "string" && item.length > 0) {
      output.push(item);
    }
  });

  if (output.length === 0) {
    return undefined;
  }

  return output;
}

function pickCommand(payload: HookPayload): string | undefined {
  const record = payload as Record<string, unknown>;
  return readString(record, "command") ?? readString(record, "bash_command") ?? readString(record, "bashCommand");
}

function pickToolName(payload: HookPayload): string | undefined {
  const record = payload as Record<string, unknown>;
  return readString(record, "tool_name") ?? readString(record, "toolName");
}

function isGitBashPayload(payload: HookPayload): boolean {
  const toolName = pickToolName(payload);
  const command = pickCommand(payload);
  if (toolName === undefined || command === undefined) {
    return false;
  }

  return toolName.toLowerCase() === "bash" && command.trim().startsWith("git ");
}

function isSessionEndEvent(payload: HookPayload): boolean {
  const eventType = pickEventType(payload).toLowerCase();
  return eventType === "session_end" || eventType === "sessionend";
}

function shouldAttemptGitEnrichment(payload: HookPayload): boolean {
  return isGitBashPayload(payload) || isSessionEndEvent(payload);
}

function parseCommitMessage(command: string): string | undefined {
  const regex = /(?:^|\s)-m\s+["']([^"']+)["']/;
  const match = command.match(regex);
  if (match?.[1] === undefined || match[1].length === 0) {
    return undefined;
  }
  return match[1];
}

function pickRepositoryPath(payload: HookPayload): string | undefined {
  const record = payload as Record<string, unknown>;
  return (
    readString(record, "project_path") ??
    readString(record, "projectPath") ??
    readString(record, "cwd") ??
    readString(record, "working_directory") ??
    readString(record, "workingDirectory")
  );
}

function toUniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  values.forEach((value) => {
    if (value.length === 0 || seen.has(value)) {
      return;
    }
    seen.add(value);
    output.push(value);
  });

  return output;
}

function parseIntSafe(raw: string): number | undefined {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function parseNumstatOutput(raw: string): {
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly filesChanged: readonly string[];
} | undefined {
  const lines = raw.split(/\r?\n/);
  let linesAdded = 0;
  let linesRemoved = 0;
  const filesChanged: string[] = [];
  let matched = false;

  lines.forEach((line) => {
    const match = line.trim().match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (match === null) {
      return;
    }

    const addedRaw = match[1];
    const removedRaw = match[2];
    const filePath = match[3]?.trim();
    if (filePath === undefined || filePath.length === 0) {
      return;
    }

    if (addedRaw !== undefined && addedRaw !== "-") {
      linesAdded += parseIntSafe(addedRaw) ?? 0;
    }
    if (removedRaw !== undefined && removedRaw !== "-") {
      linesRemoved += parseIntSafe(removedRaw) ?? 0;
    }

    filesChanged.push(filePath);
    matched = true;
  });

  if (!matched) {
    return undefined;
  }

  return {
    linesAdded,
    linesRemoved,
    filesChanged: toUniqueStrings(filesChanged)
  };
}

function stableStringify(payload: HookPayload): string {
  const keys = Object.keys(payload).sort();
  const record: Record<string, unknown> = {};
  keys.forEach((key) => {
    record[key] = payload[key];
  });
  return JSON.stringify(record);
}

function buildEventId(payload: HookPayload, now: string): string {
  const material = `${now}:${stableStringify(payload)}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}

function pickSessionId(payload: HookPayload): string {
  const fromSnake = payload["session_id"];
  if (typeof fromSnake === "string" && fromSnake.length > 0) {
    return fromSnake;
  }

  const fromCamel = payload["sessionId"];
  if (typeof fromCamel === "string" && fromCamel.length > 0) {
    return fromCamel;
  }

  return "unknown_session";
}

function pickPromptId(payload: HookPayload): string | undefined {
  const fromSnake = payload["prompt_id"];
  if (typeof fromSnake === "string" && fromSnake.length > 0) {
    return fromSnake;
  }

  const fromCamel = payload["promptId"];
  if (typeof fromCamel === "string" && fromCamel.length > 0) {
    return fromCamel;
  }

  return undefined;
}

function pickEventType(payload: HookPayload): string {
  const event = payload["event"];
  if (typeof event === "string" && event.length > 0) {
    return event;
  }
  const type = payload["type"];
  if (typeof type === "string" && type.length > 0) {
    return type;
  }
  const hook = payload["hook"];
  if (typeof hook === "string" && hook.length > 0) {
    return hook;
  }
  return "hook_event";
}

function pickTimestamp(payload: HookPayload, now: string): string {
  const value = payload["timestamp"];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return now;
}

function getPrivacyTier(store: CliConfigStore, configDir?: string): PrivacyTier {
  const config = store.readConfig(configDir);
  if (config === undefined) {
    return 1;
  }
  return config.privacyTier;
}

function getCollectorUrl(store: CliConfigStore, configDir?: string, collectorUrlOverride?: string): string {
  if (collectorUrlOverride !== undefined && collectorUrlOverride.length > 0) {
    return collectorUrlOverride;
  }

  const config = store.readConfig(configDir);
  if (config !== undefined) {
    return config.collectorUrl;
  }

  return "http://127.0.0.1:8317/v1/hooks";
}

function runGitCommand(
  args: readonly string[],
  repositoryPath?: string
): string | undefined {
  try {
    const output = execFileSync("git", [...args], {
      ...(repositoryPath !== undefined ? { cwd: repositoryPath } : {}),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const trimmed = output.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    return trimmed;
  } catch {
    return undefined;
  }
}

export class ShellHookGitContextProvider implements HookGitContextProvider {
  public readContext(request: HookGitContextRequest): HookGitRepositoryState | undefined {
    const branch = runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], request.repositoryPath);
    const headSha = runGitCommand(["rev-parse", "HEAD"], request.repositoryPath);
    const diffStatsRaw =
      request.includeDiffStats && request.diffSource === "working_tree"
        ? runGitCommand(["diff", "--numstat", "HEAD"], request.repositoryPath)
        : request.includeDiffStats
          ? runGitCommand(["show", "--numstat", "--format="], request.repositoryPath)
          : undefined;
    const diffStats = diffStatsRaw === undefined ? undefined : parseNumstatOutput(diffStatsRaw);

    if (
      branch === undefined &&
      headSha === undefined &&
      diffStats?.linesAdded === undefined &&
      diffStats?.linesRemoved === undefined &&
      diffStats?.filesChanged === undefined
    ) {
      return undefined;
    }

    return {
      ...(branch !== undefined ? { branch } : {}),
      ...(headSha !== undefined ? { headSha } : {}),
      ...(diffStats?.linesAdded !== undefined ? { linesAdded: diffStats.linesAdded } : {}),
      ...(diffStats?.linesRemoved !== undefined ? { linesRemoved: diffStats.linesRemoved } : {}),
      ...(diffStats?.filesChanged !== undefined ? { filesChanged: diffStats.filesChanged } : {})
    };
  }
}

function enrichHookPayloadWithGitContext(
  payload: HookPayload,
  provider: HookGitContextProvider
): {
  readonly payload: HookPayload;
  readonly enriched: boolean;
} {
  if (!shouldAttemptGitEnrichment(payload)) {
    return {
      payload,
      enriched: false
    };
  }

  const record = payload as Record<string, unknown>;
  const command = pickCommand(payload);
  const includeDiffStats = (command !== undefined && command.includes(" commit ")) || isSessionEndEvent(payload);
  const diffSource = isSessionEndEvent(payload) ? "working_tree" : "head_commit";
  const repositoryPath = pickRepositoryPath(payload);
  const contextRequest: HookGitContextRequest = {
    includeDiffStats,
    ...(includeDiffStats ? { diffSource } : {}),
    ...(repositoryPath !== undefined ? { repositoryPath } : {})
  };
  const gitContext = provider.readContext(contextRequest);
  const patch: Record<string, unknown> = {};

  const commitMessage = command === undefined ? undefined : parseCommitMessage(command);
  const existingCommitMessage = readString(record, "commit_message") ?? readString(record, "commitMessage");
  if (existingCommitMessage === undefined && commitMessage !== undefined) {
    patch["commit_message"] = commitMessage;
  }

  const existingBranch = readString(record, "git_branch") ?? readString(record, "gitBranch");
  if (existingBranch === undefined && gitContext?.branch !== undefined) {
    patch["git_branch"] = gitContext.branch;
  }

  const existingCommitSha = readString(record, "commit_sha") ?? readString(record, "commitSha");
  if (existingCommitSha === undefined && gitContext?.headSha !== undefined) {
    patch["commit_sha"] = gitContext.headSha;
  }

  const existingLinesAdded = readNumber(record, "lines_added") ?? readNumber(record, "linesAdded");
  if (existingLinesAdded === undefined && gitContext?.linesAdded !== undefined) {
    patch["lines_added"] = gitContext.linesAdded;
  }

  const existingLinesRemoved = readNumber(record, "lines_removed") ?? readNumber(record, "linesRemoved");
  if (existingLinesRemoved === undefined && gitContext?.linesRemoved !== undefined) {
    patch["lines_removed"] = gitContext.linesRemoved;
  }

  const existingFilesChanged =
    readStringArray(record, "files_changed") ?? readStringArray(record, "filesChanged");
  if (existingFilesChanged === undefined && gitContext?.filesChanged !== undefined) {
    patch["files_changed"] = gitContext.filesChanged;
  }

  if (Object.keys(patch).length === 0) {
    return {
      payload,
      enriched: false
    };
  }

  return {
    payload: {
      ...payload,
      ...patch
    },
    enriched: true
  };
}

function toEnvelope(
  payload: HookPayload,
  privacyTier: PrivacyTier,
  now: string,
  extraAttributes: Record<string, string> = {}
): EventEnvelope<HookPayload> {
  const promptId = pickPromptId(payload);
  const eventType = pickEventType(payload);

  const envelope: EventEnvelope<HookPayload> = {
    schemaVersion: "1.0",
    source: "hook",
    sourceVersion: "agent-trace-cli-v0.1",
    eventId: buildEventId(payload, now),
    sessionId: pickSessionId(payload),
    ...(promptId !== undefined ? { promptId } : {}),
    eventType,
    eventTimestamp: pickTimestamp(payload, now),
    ingestedAt: now,
    privacyTier,
    payload,
    attributes: {
      hook_name: eventType,
      ...extraAttributes
    }
  };

  return envelope;
}

function validateEnvelope(envelope: EventEnvelope<HookPayload>): readonly string[] {
  const errors: string[] = [];

  if (envelope.schemaVersion !== "1.0") {
    errors.push("schemaVersion must equal 1.0");
  }
  if (envelope.source !== "hook") {
    errors.push("source must equal hook");
  }
  if (envelope.eventId.length === 0) {
    errors.push("eventId must be non-empty");
  }
  if (envelope.sessionId.length === 0) {
    errors.push("sessionId must be non-empty");
  }
  if (envelope.eventType.length === 0) {
    errors.push("eventType must be non-empty");
  }
  if (!isIsoDate(envelope.eventTimestamp)) {
    errors.push("eventTimestamp must be ISO-8601");
  }
  if (!isIsoDate(envelope.ingestedAt)) {
    errors.push("ingestedAt must be ISO-8601");
  }
  if (envelope.privacyTier !== 1 && envelope.privacyTier !== 2 && envelope.privacyTier !== 3) {
    errors.push("privacyTier must be 1, 2, or 3");
  }

  return errors;
}

export function runHookHandler(
  input: HookHandlerInput,
  store: CliConfigStore = new FileCliConfigStore(),
  gitContextProvider: HookGitContextProvider = new ShellHookGitContextProvider()
): HookHandlerResult {
  let payload: HookPayload | undefined;
  try {
    payload = parseHookPayload(input.rawStdin);
  } catch {
    return {
      ok: false,
      errors: ["hook payload is not valid JSON"]
    };
  }

  if (payload === undefined) {
    return {
      ok: false,
      errors: ["hook payload is empty or invalid"]
    };
  }

  const now = input.nowIso ?? new Date().toISOString();
  const privacyTier = getPrivacyTier(store, input.configDir);
  const enrichment = enrichHookPayloadWithGitContext(payload, gitContextProvider);
  const envelope = toEnvelope(enrichment.payload, privacyTier, now, {
    ...(enrichment.enriched ? { git_enriched: "1" } : {})
  });
  const errors = validateEnvelope(envelope);
  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    envelope
  };
}

export class FetchCollectorHttpClient implements CollectorHttpClient {
  public async postJson(url: string, payload: unknown): Promise<CollectorHttpPostResult> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = await response.text();
      return {
        ok: true,
        statusCode: response.status,
        body
      };
    } catch (error: unknown) {
      return {
        ok: false,
        statusCode: 0,
        body: "",
        error: String(error)
      };
    }
  }
}

function isSuccessStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export async function runHookHandlerAndForward(
  input: HookForwardInput,
  client: CollectorHttpClient = new FetchCollectorHttpClient(),
  store: CliConfigStore = new FileCliConfigStore(),
  gitContextProvider: HookGitContextProvider = new ShellHookGitContextProvider()
): Promise<HookForwardResult> {
  const hookResult = runHookHandler(
    {
      rawStdin: input.rawStdin,
      ...(input.configDir !== undefined ? { configDir: input.configDir } : {}),
      ...(input.nowIso !== undefined ? { nowIso: input.nowIso } : {})
    },
    store,
    gitContextProvider
  );

  if (!hookResult.ok) {
    return {
      ok: false,
      errors: hookResult.errors
    };
  }

  const collectorUrl = getCollectorUrl(store, input.configDir, input.collectorUrl);
  const postResult = await client.postJson(collectorUrl, hookResult.envelope);
  if (!postResult.ok) {
    return {
      ok: false,
      envelope: hookResult.envelope,
      errors: [postResult.error ?? "failed to send hook event to collector"]
    };
  }

  if (!isSuccessStatus(postResult.statusCode)) {
    return {
      ok: false,
      envelope: hookResult.envelope,
      statusCode: postResult.statusCode,
      errors: [
        `collector returned status ${String(postResult.statusCode)}`,
        ...(postResult.body.length > 0 ? [postResult.body] : [])
      ]
    };
  }

  return {
    ok: true,
    envelope: hookResult.envelope,
    collectorUrl,
    statusCode: postResult.statusCode,
    body: postResult.body
  };
}

import type { CollectorEnvelopeEvent, CollectorEnvelopePayload } from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function readString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

function readNumber(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function readStringArray(record: UnknownRecord, key: string): readonly string[] | undefined {
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

function readNestedString(
  record: UnknownRecord,
  path: readonly string[]
): string | undefined {
  let current: unknown = record;
  for (const key of path) {
    const asObject = asRecord(current);
    if (asObject === undefined) {
      return undefined;
    }
    current = asObject[key];
  }

  if (typeof current === "string" && current.length > 0) {
    return current;
  }
  return undefined;
}

function pickCommand(payload: CollectorEnvelopePayload): string | undefined {
  const record = payload as UnknownRecord;
  return (
    readString(record, "command") ??
    readString(record, "bash_command") ??
    readString(record, "bashCommand") ??
    readNestedString(record, ["tool_input", "command"])
  );
}

function pickStdout(payload: CollectorEnvelopePayload): string | undefined {
  const record = payload as UnknownRecord;
  return readString(record, "stdout") ?? readString(record, "output");
}

function pickToolName(payload: CollectorEnvelopePayload): string | undefined {
  const record = payload as UnknownRecord;
  return readString(record, "tool_name") ?? readString(record, "toolName");
}

function isGitCommand(command: string): boolean {
  return command.trim().startsWith("git ");
}

function parseCommitMessage(command: string): string | undefined {
  const regex = /(?:^|\s)-m\s+["']([^"']+)["']/;
  const match = command.match(regex);
  if (match === null || match[1] === undefined || match[1].length === 0) {
    return undefined;
  }
  return match[1];
}

function parseCommitSha(stdout: string): string | undefined {
  const match = stdout.match(/\b[0-9a-f]{7,40}\b/i);
  if (match === null || match[0] === undefined) {
    return undefined;
  }
  return match[0].toLowerCase();
}

function parseBranch(command: string): string | undefined {
  const checkoutMatch = command.match(/git\s+checkout\s+-b\s+([^\s]+)/);
  if (checkoutMatch?.[1] !== undefined && checkoutMatch[1].length > 0) {
    return checkoutMatch[1];
  }

  const switchMatch = command.match(/git\s+switch\s+-c\s+([^\s]+)/);
  if (switchMatch?.[1] !== undefined && switchMatch[1].length > 0) {
    return switchMatch[1];
  }

  return undefined;
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

function parseInteger(input: string): number | undefined {
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

interface GitChangeMetadata {
  readonly linesAdded?: number;
  readonly linesRemoved?: number;
  readonly filesChanged?: readonly string[];
}

function parseNumstat(stdout: string): GitChangeMetadata | undefined {
  const lines = stdout.split(/\r?\n/);
  let linesAdded = 0;
  let linesRemoved = 0;
  const filesChanged: string[] = [];
  let matched = false;

  lines.forEach((line) => {
    const match = line.trim().match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (match === null) {
      return;
    }

    const filePath = match[3]?.trim();
    if (filePath === undefined || filePath.length === 0) {
      return;
    }

    const add = match[1];
    const remove = match[2];
    if (add !== undefined && add !== "-") {
      linesAdded += parseInteger(add) ?? 0;
    }
    if (remove !== undefined && remove !== "-") {
      linesRemoved += parseInteger(remove) ?? 0;
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

function parseShortStat(stdout: string): GitChangeMetadata | undefined {
  const insertionMatch = stdout.match(/(\d+)\s+insertions?\(\+\)/);
  const deletionMatch = stdout.match(/(\d+)\s+deletions?\(-\)/);

  const linesAdded = insertionMatch?.[1] === undefined ? undefined : parseInteger(insertionMatch[1]);
  const linesRemoved = deletionMatch?.[1] === undefined ? undefined : parseInteger(deletionMatch[1]);

  if (linesAdded === undefined && linesRemoved === undefined) {
    return undefined;
  }

  return {
    ...(linesAdded !== undefined ? { linesAdded } : {}),
    ...(linesRemoved !== undefined ? { linesRemoved } : {})
  };
}

function parseNameOnlyFiles(command: string, stdout: string): readonly string[] | undefined {
  if (!command.includes("--name-only")) {
    return undefined;
  }

  const filesChanged = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("commit "))
    .filter((line) => !line.startsWith("Author:"))
    .filter((line) => !line.startsWith("Date:"))
    .filter((line) => !line.startsWith("["))
    .filter((line) => !line.includes("|"))
    .filter((line) => !line.includes("files changed"));

  if (filesChanged.length === 0) {
    return undefined;
  }

  return toUniqueStrings(filesChanged);
}

function parseStatFiles(command: string, stdout: string): readonly string[] | undefined {
  if (!command.includes("--stat")) {
    return undefined;
  }

  const filesChanged: string[] = [];
  stdout.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(.+?)\s+\|\s+\d+/);
    const filePath = match?.[1]?.trim();
    if (filePath !== undefined && filePath.length > 0) {
      filesChanged.push(filePath);
    }
  });

  if (filesChanged.length === 0) {
    return undefined;
  }

  return toUniqueStrings(filesChanged);
}

function parseGitChangeMetadata(command: string, stdout: string): GitChangeMetadata | undefined {
  const numstat = parseNumstat(stdout);
  const shortStat = parseShortStat(stdout);
  const nameOnlyFiles = parseNameOnlyFiles(command, stdout);
  const statFiles = parseStatFiles(command, stdout);
  const filesChanged = nameOnlyFiles ?? numstat?.filesChanged ?? statFiles;
  const linesAdded = numstat?.linesAdded ?? shortStat?.linesAdded;
  const linesRemoved = numstat?.linesRemoved ?? shortStat?.linesRemoved;

  if (filesChanged === undefined && linesAdded === undefined && linesRemoved === undefined) {
    return undefined;
  }

  return {
    ...(filesChanged !== undefined ? { filesChanged } : {}),
    ...(linesAdded !== undefined ? { linesAdded } : {}),
    ...(linesRemoved !== undefined ? { linesRemoved } : {})
  };
}

function isBashTool(payload: CollectorEnvelopePayload): boolean {
  const toolName = pickToolName(payload);
  if (toolName === undefined) {
    return false;
  }
  const normalized = toolName.toLowerCase();
  return normalized === "bash";
}

export function enrichCollectorEventWithGitMetadata(
  event: CollectorEnvelopeEvent
): CollectorEnvelopeEvent {
  if (event.source !== "hook") {
    return event;
  }

  if (!isBashTool(event.payload)) {
    return event;
  }

  const command = pickCommand(event.payload);
  if (command === undefined || !isGitCommand(command)) {
    return event;
  }
  const payloadRecord = event.payload as UnknownRecord;

  const commitMessage = parseCommitMessage(command);
  const commitSha = parseCommitSha(pickStdout(event.payload) ?? "");
  const branch = parseBranch(command);
  const changes = parseGitChangeMetadata(command, pickStdout(event.payload) ?? "");
  const existingCommitSha = readString(payloadRecord, "commit_sha") ?? readString(payloadRecord, "commitSha");
  const existingCommitMessage =
    readString(payloadRecord, "commit_message") ?? readString(payloadRecord, "commitMessage");
  const existingGitBranch = readString(payloadRecord, "git_branch") ?? readString(payloadRecord, "gitBranch");
  const existingLinesAdded = readNumber(payloadRecord, "lines_added") ?? readNumber(payloadRecord, "linesAdded");
  const existingLinesRemoved =
    readNumber(payloadRecord, "lines_removed") ?? readNumber(payloadRecord, "linesRemoved");
  const existingFilesChanged =
    readStringArray(payloadRecord, "files_changed") ?? readStringArray(payloadRecord, "filesChanged");
  const patch: Record<string, unknown> = {};

  if (existingCommitSha === undefined && commitSha !== undefined) {
    patch["commit_sha"] = commitSha;
  }
  if (existingCommitMessage === undefined && commitMessage !== undefined) {
    patch["commit_message"] = commitMessage;
  }
  if (existingGitBranch === undefined && branch !== undefined) {
    patch["git_branch"] = branch;
  }
  if (existingLinesAdded === undefined && changes?.linesAdded !== undefined) {
    patch["lines_added"] = changes.linesAdded;
  }
  if (existingLinesRemoved === undefined && changes?.linesRemoved !== undefined) {
    patch["lines_removed"] = changes.linesRemoved;
  }
  if (existingFilesChanged === undefined && changes?.filesChanged !== undefined) {
    patch["files_changed"] = changes.filesChanged;
  }

  if (Object.keys(patch).length === 0) {
    return event;
  }

  const payload: CollectorEnvelopePayload = {
    ...event.payload,
    ...patch
  };

  return {
    ...event,
    payload,
    attributes: {
      ...(event.attributes ?? {}),
      git_enriched: "1"
    }
  };
}

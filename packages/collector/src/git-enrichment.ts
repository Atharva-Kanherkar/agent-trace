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

function hasGitMetadata(payload: CollectorEnvelopePayload): boolean {
  const record = payload as UnknownRecord;
  return (
    readString(record, "commit_sha") !== undefined ||
    readString(record, "commitSha") !== undefined ||
    readString(record, "commit_message") !== undefined ||
    readString(record, "commitMessage") !== undefined ||
    readString(record, "git_branch") !== undefined ||
    readString(record, "gitBranch") !== undefined
  );
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

  if (hasGitMetadata(event.payload)) {
    return event;
  }

  const commitMessage = parseCommitMessage(command);
  const commitSha = parseCommitSha(pickStdout(event.payload) ?? "");
  const branch = parseBranch(command);

  if (commitMessage === undefined && commitSha === undefined && branch === undefined) {
    return event;
  }

  const payload: CollectorEnvelopePayload = {
    ...event.payload,
    ...(commitSha !== undefined ? { commit_sha: commitSha } : {}),
    ...(commitMessage !== undefined ? { commit_message: commitMessage } : {}),
    ...(branch !== undefined ? { git_branch: branch } : {})
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

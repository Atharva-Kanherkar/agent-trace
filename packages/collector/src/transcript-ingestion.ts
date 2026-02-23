import type { EventEnvelope } from "../../schema/src/types";
import type {
  CollectorAcceptedEventProcessor,
  TranscriptEventPayload,
  TranscriptIngestionProcessorOptions
} from "./types";
import { parseTranscriptJsonl } from "./transcript-parser";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function shouldIngestTranscript(eventType: string): boolean {
  const normalized = eventType.toLowerCase();
  return normalized === "session_end" || normalized === "stop" || normalized === "task_completed";
}

function pickTranscriptPath(payload: TranscriptEventPayload): string | undefined {
  const record = asRecord(payload);
  if (record === undefined) {
    return undefined;
  }

  return readString(record, ["transcript_path", "transcriptPath"]);
}

export function createTranscriptIngestionProcessor(
  options: TranscriptIngestionProcessorOptions
): CollectorAcceptedEventProcessor<EventEnvelope<TranscriptEventPayload>> {
  return {
    processAcceptedEvent: async (event: EventEnvelope<TranscriptEventPayload>): Promise<void> => {
      if (!shouldIngestTranscript(event.eventType)) {
        return;
      }

      const transcriptPath = pickTranscriptPath(event.payload);
      if (transcriptPath === undefined) {
        return;
      }

      const parseResult = parseTranscriptJsonl({
        filePath: transcriptPath,
        privacyTier: event.privacyTier,
        sessionIdFallback: event.sessionId,
        ingestedAt: event.ingestedAt
      });

      if (!parseResult.ok && options.onParseErrors !== undefined) {
        options.onParseErrors(parseResult.errors);
      }

      if (parseResult.parsedEvents.length === 0) {
        return;
      }

      await options.sink.ingestTranscriptEvents(parseResult.parsedEvents);
    }
  };
}

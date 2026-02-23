import type { EventEnvelope } from "../../schema/src/types";
import { validateEventEnvelope } from "../../schema/src/validators";
import { createCollectorService } from "./service";
import { InMemoryCollectorStore } from "./store";
import { createTranscriptIngestionProcessor } from "./transcript-ingestion";
import type {
  CollectorAcceptedEventProcessor,
  CollectorEnvelopeEvent,
  CollectorHandlerDependencies,
  CollectorValidationResult,
  EnvelopeCollectorService,
  EnvelopeCollectorServiceOptions,
  TranscriptEventPayload
} from "./types";

function toCollectorValidationResult(input: unknown): CollectorValidationResult<CollectorEnvelopeEvent> {
  const validation = validateEventEnvelope(input);
  if (!validation.ok) {
    return {
      ok: false,
      value: undefined,
      errors: validation.errors
    };
  }

  return {
    ok: true,
    value: validation.value as CollectorEnvelopeEvent,
    errors: []
  };
}

function toCollectorEnvelopeEvent(event: EventEnvelope<TranscriptEventPayload>): CollectorEnvelopeEvent {
  return event as CollectorEnvelopeEvent;
}

async function ingestEventIntoDependencies(
  event: CollectorEnvelopeEvent,
  dependencies: CollectorHandlerDependencies<CollectorEnvelopeEvent>
): Promise<void> {
  const ingest = dependencies.store.ingest(event, event.eventId);
  if (!ingest.accepted) {
    return;
  }

  if (dependencies.onAcceptedEvent !== undefined) {
    await dependencies.onAcceptedEvent(event);
  }
}

function combineProcessors(
  processors: readonly CollectorAcceptedEventProcessor<CollectorEnvelopeEvent>[]
): CollectorAcceptedEventProcessor<CollectorEnvelopeEvent> | undefined {
  if (processors.length === 0) {
    return undefined;
  }

  return {
    processAcceptedEvent: async (event: CollectorEnvelopeEvent): Promise<void> => {
      for (const processor of processors) {
        await processor.processAcceptedEvent(event);
      }
    }
  };
}

export function createEnvelopeCollectorService(
  options: EnvelopeCollectorServiceOptions = {}
): EnvelopeCollectorService {
  const store = new InMemoryCollectorStore<CollectorEnvelopeEvent>();

  let ingestEventsRef:
    | ((events: readonly CollectorEnvelopeEvent[]) => Promise<void>)
    | undefined;
  const transcriptSink = {
    ingestTranscriptEvents: async (events: readonly EventEnvelope<TranscriptEventPayload>[]): Promise<void> => {
      if (ingestEventsRef === undefined) {
        return;
      }

      const collectorEvents = events.map((event) => toCollectorEnvelopeEvent(event));
      await ingestEventsRef(collectorEvents);
    }
  };

  const processors: CollectorAcceptedEventProcessor<CollectorEnvelopeEvent>[] = [];
  if (options.enableTranscriptIngestion ?? true) {
    const transcriptProcessor = createTranscriptIngestionProcessor({
      sink: transcriptSink
    });
    processors.push({
      processAcceptedEvent: async (event: CollectorEnvelopeEvent): Promise<void> => {
        await transcriptProcessor.processAcceptedEvent(event as EventEnvelope<TranscriptEventPayload>);
      }
    });
  }
  if (options.processor !== undefined) {
    processors.push(options.processor);
  }

  const processor = combineProcessors(processors);
  const dependencies: CollectorHandlerDependencies<CollectorEnvelopeEvent> = {
    startedAtMs: options.startedAtMs ?? Date.now(),
    validateEvent: toCollectorValidationResult,
    getEventId: (event: CollectorEnvelopeEvent): string => event.eventId,
    store,
    ...(options.onAcceptedEvent !== undefined ? { onAcceptedEvent: options.onAcceptedEvent } : {})
  };

  const service = createCollectorService({
    dependencies,
    ...(processor !== undefined ? { processor } : {})
  });

  const ingestEvents = async (events: readonly CollectorEnvelopeEvent[]): Promise<void> => {
    for (const event of events) {
      await ingestEventIntoDependencies(event, service.dependencies);
    }
  };
  ingestEventsRef = ingestEvents;

  const otelSink = {
    ingestOtelEvents: async (events: readonly EventEnvelope<TranscriptEventPayload>[]): Promise<void> => {
      const collectorEvents = events.map((event) => toCollectorEnvelopeEvent(event));
      await ingestEvents(collectorEvents);
    }
  };

  return {
    dependencies: service.dependencies,
    store,
    handleRaw: service.handleRaw,
    getProcessingStats: service.getProcessingStats,
    ingestEvents,
    otelSink,
    transcriptSink
  };
}

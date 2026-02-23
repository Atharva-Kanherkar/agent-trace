import { handleCollectorRawHttpRequest } from "./http";
import type {
  CollectorAcceptedEventProcessor,
  CollectorHandlerDependencies,
  CollectorProcessingStats,
  CollectorRawHttpRequest,
  CollectorResponse
} from "./types";

interface CollectorServiceState {
  acceptedEvents: number;
  processingFailures: number;
  lastProcessingFailure?: string;
}

function toReadonlyStats(state: CollectorServiceState): CollectorProcessingStats {
  return {
    acceptedEvents: state.acceptedEvents,
    processingFailures: state.processingFailures,
    ...(state.lastProcessingFailure !== undefined
      ? { lastProcessingFailure: state.lastProcessingFailure }
      : {})
  };
}

export interface CollectorService<TEvent> {
  readonly dependencies: CollectorHandlerDependencies<TEvent>;
  handleRaw(request: CollectorRawHttpRequest): CollectorResponse;
  getProcessingStats(): CollectorProcessingStats;
}

export interface CreateCollectorServiceOptions<TEvent> {
  readonly dependencies: CollectorHandlerDependencies<TEvent>;
  readonly processor?: CollectorAcceptedEventProcessor<TEvent>;
}

export function createCollectorService<TEvent>(
  options: CreateCollectorServiceOptions<TEvent>
): CollectorService<TEvent> {
  const state: CollectorServiceState = {
    acceptedEvents: 0,
    processingFailures: 0
  };

  const baseOnAcceptedEvent = options.dependencies.onAcceptedEvent;
  const dependencies: CollectorHandlerDependencies<TEvent> = {
    ...options.dependencies,
    onAcceptedEvent: async (event: TEvent): Promise<void> => {
      state.acceptedEvents += 1;

      const runBase = async (): Promise<void> => {
        if (baseOnAcceptedEvent !== undefined) {
          await baseOnAcceptedEvent(event);
        }
      };
      const runProcessor = async (): Promise<void> => {
        if (options.processor !== undefined) {
          await options.processor.processAcceptedEvent(event);
        }
      };

      try {
        await Promise.all([runBase(), runProcessor()]);
      } catch (error: unknown) {
        state.processingFailures += 1;
        state.lastProcessingFailure = String(error);
      }
    }
  };

  return {
    dependencies,
    handleRaw: (request: CollectorRawHttpRequest): CollectorResponse =>
      handleCollectorRawHttpRequest(request, dependencies),
    getProcessingStats: (): CollectorProcessingStats => toReadonlyStats(state)
  };
}

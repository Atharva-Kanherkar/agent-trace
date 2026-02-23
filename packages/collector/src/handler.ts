import type {
  CollectorAcceptResponse,
  CollectorErrorResponse,
  CollectorHandlerDependencies,
  CollectorHealthResponse,
  CollectorRequest,
  CollectorResponse,
  CollectorStatsResponse
} from "./types";

function buildHealthPayload(startedAtMs: number): CollectorHealthResponse {
  return {
    status: "ok",
    service: "collector",
    uptimeSec: Math.floor((Date.now() - startedAtMs) / 1000)
  };
}

function buildErrorPayload(message: string, errors?: readonly string[]): CollectorErrorResponse {
  return {
    status: "error",
    message,
    ...(errors !== undefined ? { errors } : {})
  };
}

function buildStatsPayload(storedEvents: number, dedupedEvents: number): CollectorStatsResponse {
  return {
    status: "ok",
    stats: {
      storedEvents,
      dedupedEvents
    }
  };
}

function buildAcceptedPayload(accepted: boolean, deduped: boolean): CollectorAcceptResponse {
  return {
    status: "accepted",
    accepted,
    deduped
  };
}

export function handleCollectorRequest<TEvent>(
  request: CollectorRequest,
  dependencies: CollectorHandlerDependencies<TEvent>
): CollectorResponse {
  if (request.method === "GET" && request.url === "/health") {
    return {
      statusCode: 200,
      payload: buildHealthPayload(dependencies.startedAtMs)
    };
  }

  if (request.method === "GET" && request.url === "/v1/hooks/stats") {
    const stats = dependencies.store.getStats();
    return {
      statusCode: 200,
      payload: buildStatsPayload(stats.storedEvents, stats.dedupedEvents)
    };
  }

  if (request.method === "POST" && request.url === "/v1/hooks") {
    const validation = dependencies.validateEvent(request.body);
    if (!validation.ok) {
      return {
        statusCode: 400,
        payload: buildErrorPayload("invalid event payload", validation.errors)
      };
    }

    const eventId = dependencies.getEventId(validation.value);
    const ingest = dependencies.store.ingest(validation.value, eventId);
    if (ingest.accepted && dependencies.onAcceptedEvent !== undefined) {
      try {
        dependencies.onAcceptedEvent(validation.value);
      } catch {
        // Collector should not fail request handling if projection callback fails.
      }
    }
    return {
      statusCode: 202,
      payload: buildAcceptedPayload(ingest.accepted, ingest.deduped)
    };
  }

  return {
    statusCode: 404,
    payload: buildErrorPayload("not found")
  };
}

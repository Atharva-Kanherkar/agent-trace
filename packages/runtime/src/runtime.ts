import http from "node:http";

import { handleApiRawHttpRequest, InMemorySessionRepository } from "../../api/src";
import { createApiHttpHandler } from "../../api/src/http";
import { handleCollectorRawHttpRequest, InMemoryCollectorStore } from "../../collector/src";
import { createCollectorHttpHandler } from "../../collector/src/http";
import type { CollectorHandlerDependencies, CollectorValidationResult } from "../../collector/src/types";
import { validateEventEnvelope } from "../../schema/src/validators";
import { InMemoryRuntimePersistence } from "./persistence";
import type {
  InMemoryRuntimeOptions,
  RuntimeEnvelope,
  RuntimePersistence,
  RuntimeRequestHandlers,
  RuntimeStartOptions,
  RuntimeStartedServers
} from "./types";
import { projectEnvelopeToTrace } from "./projector";

function toCollectorValidationResult(input: unknown): CollectorValidationResult<RuntimeEnvelope> {
  const result = validateEventEnvelope(input);
  if (!result.ok) {
    return {
      ok: false,
      value: undefined,
      errors: result.errors
    };
  }

  return {
    ok: true,
    value: result.value as RuntimeEnvelope,
    errors: []
  };
}

function toAddress(server: http.Server): string {
  const address = server.address();
  if (address === null) {
    return "unknown";
  }
  if (typeof address === "string") {
    return address;
  }
  return `${address.address}:${String(address.port)}`;
}

async function listen(server: http.Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", (error) => reject(error));
  });
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined && error !== null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export interface InMemoryRuntime extends RuntimeRequestHandlers {
  readonly sessionRepository: InMemorySessionRepository;
  readonly collectorStore: InMemoryCollectorStore<RuntimeEnvelope>;
  readonly collectorDependencies: CollectorHandlerDependencies<RuntimeEnvelope>;
  readonly persistence: RuntimePersistence;
}

function resolveRuntimeOptions(input: number | InMemoryRuntimeOptions | undefined): {
  readonly startedAtMs: number;
  readonly persistence: RuntimePersistence;
} {
  if (typeof input === "number") {
    return {
      startedAtMs: input,
      persistence: new InMemoryRuntimePersistence()
    };
  }

  const startedAtMs = input?.startedAtMs ?? Date.now();
  const persistence = input?.persistence ?? new InMemoryRuntimePersistence();
  return {
    startedAtMs,
    persistence
  };
}

export function createInMemoryRuntime(input?: number | InMemoryRuntimeOptions): InMemoryRuntime {
  const options = resolveRuntimeOptions(input);
  const sessionRepository = new InMemorySessionRepository();
  const collectorStore = new InMemoryCollectorStore<RuntimeEnvelope>();
  const persistence = options.persistence;

  const collectorDependencies: CollectorHandlerDependencies<RuntimeEnvelope> = {
    startedAtMs: options.startedAtMs,
    validateEvent: toCollectorValidationResult,
    getEventId: (event: RuntimeEnvelope): string => event.eventId,
    store: collectorStore,
    onAcceptedEvent: async (event: RuntimeEnvelope): Promise<void> => {
      const current = sessionRepository.getBySessionId(event.sessionId);
      const projected = projectEnvelopeToTrace(current, event);
      sessionRepository.upsert(projected);
      await persistence.persistAcceptedEvent(event, projected);
    }
  };

  const apiDependencies = {
    startedAtMs: options.startedAtMs,
    repository: sessionRepository
  } as const;

  return {
    sessionRepository,
    collectorStore,
    collectorDependencies,
    persistence,
    handleCollectorRaw: (request) => handleCollectorRawHttpRequest(request, collectorDependencies),
    handleApiRaw: (request) => handleApiRawHttpRequest(request, apiDependencies)
  };
}

export async function startInMemoryRuntimeServers(
  runtime: InMemoryRuntime,
  options: RuntimeStartOptions = {}
): Promise<RuntimeStartedServers> {
  const host = options.host ?? "127.0.0.1";
  const collectorPort = options.collectorPort ?? 8317;
  const apiPort = options.apiPort ?? 8318;

  const collectorServer = http.createServer(createCollectorHttpHandler(runtime.collectorDependencies));
  const apiServer = http.createServer(
    createApiHttpHandler({
      startedAtMs: runtime.collectorDependencies.startedAtMs,
      repository: runtime.sessionRepository
    })
  );

  await listen(collectorServer, collectorPort, host);
  await listen(apiServer, apiPort, host);

  return {
    collectorAddress: toAddress(collectorServer),
    apiAddress: toAddress(apiServer),
    close: async (): Promise<void> => {
      await close(collectorServer);
      await close(apiServer);
    }
  };
}

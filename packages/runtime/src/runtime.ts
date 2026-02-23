import http from "node:http";

import { handleApiRawHttpRequest, InMemorySessionRepository } from "../../api/src";
import { createApiHttpHandler } from "../../api/src/http";
import { handleCollectorRawHttpRequest, InMemoryCollectorStore } from "../../collector/src";
import { createCollectorHttpHandler } from "../../collector/src/http";
import type { CollectorHandlerDependencies, CollectorValidationResult } from "../../collector/src/types";
import { validateEventEnvelope } from "../../schema/src/validators";
import type { RuntimeEnvelope, RuntimeRequestHandlers, RuntimeStartOptions, RuntimeStartedServers } from "./types";
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
}

export function createInMemoryRuntime(startedAtMs: number = Date.now()): InMemoryRuntime {
  const sessionRepository = new InMemorySessionRepository();
  const collectorStore = new InMemoryCollectorStore<RuntimeEnvelope>();

  const collectorDependencies: CollectorHandlerDependencies<RuntimeEnvelope> = {
    startedAtMs,
    validateEvent: toCollectorValidationResult,
    getEventId: (event: RuntimeEnvelope): string => event.eventId,
    store: collectorStore,
    onAcceptedEvent: (event: RuntimeEnvelope): void => {
      const current = sessionRepository.getBySessionId(event.sessionId);
      const projected = projectEnvelopeToTrace(current, event);
      sessionRepository.upsert(projected);
    }
  };

  const apiDependencies = {
    startedAtMs,
    repository: sessionRepository
  } as const;

  return {
    sessionRepository,
    collectorStore,
    collectorDependencies,
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


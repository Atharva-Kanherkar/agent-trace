import http from "node:http";

import { handleApiRawHttpRequest, InMemorySessionRepository } from "../../api/src";
import { createApiHttpHandler } from "../../api/src/http";
import { createCollectorHttpHandler, createEnvelopeCollectorService, startOtelGrpcReceiver } from "../../collector/src";
import type {
  CollectorEventStore,
  CollectorHandlerDependencies,
  EnvelopeCollectorService,
  OtelEventsSink,
  OtelGrpcReceiverHandle
} from "../../collector/src/types";
import { InMemoryRuntimePersistence } from "./persistence";
import type {
  InMemoryRuntimeOptions,
  RuntimeDailyCostReader,
  RuntimeEnvelope,
  RuntimePersistence,
  RuntimeRequestHandlers,
  RuntimeStartOptions,
  RuntimeStartedServers
} from "./types";
import { projectEnvelopeToTrace } from "./projector";

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
  readonly collectorStore: CollectorEventStore<RuntimeEnvelope>;
  readonly collectorDependencies: CollectorHandlerDependencies<RuntimeEnvelope>;
  readonly collectorService: EnvelopeCollectorService;
  readonly persistence: RuntimePersistence;
  readonly dailyCostReader?: RuntimeDailyCostReader;
}

async function projectAndPersistEvent(
  event: RuntimeEnvelope,
  sessionRepository: InMemorySessionRepository,
  persistence: RuntimePersistence
): Promise<void> {
  const current = sessionRepository.getBySessionId(event.sessionId);
  const projected = projectEnvelopeToTrace(current, event);
  sessionRepository.upsert(projected);
  await persistence.persistAcceptedEvent(event, projected);
}

export function createRuntimeOtelSink(runtime: InMemoryRuntime): OtelEventsSink {
  return runtime.collectorService.otelSink;
}

function resolveRuntimeOptions(input: number | InMemoryRuntimeOptions | undefined): {
  readonly startedAtMs: number;
  readonly persistence: RuntimePersistence;
  readonly dailyCostReader: RuntimeDailyCostReader | undefined;
} {
  if (typeof input === "number") {
    return {
      startedAtMs: input,
      persistence: new InMemoryRuntimePersistence(),
      dailyCostReader: undefined
    };
  }

  const startedAtMs = input?.startedAtMs ?? Date.now();
  const persistence = input?.persistence ?? new InMemoryRuntimePersistence();
  return {
    startedAtMs,
    persistence,
    dailyCostReader: input?.dailyCostReader
  };
}

export function createInMemoryRuntime(input?: number | InMemoryRuntimeOptions): InMemoryRuntime {
  const options = resolveRuntimeOptions(input);
  const sessionRepository = new InMemorySessionRepository();
  const persistence = options.persistence;

  const collectorService = createEnvelopeCollectorService({
    startedAtMs: options.startedAtMs,
    onAcceptedEvent: async (event: RuntimeEnvelope): Promise<void> => {
      await projectAndPersistEvent(event, sessionRepository, persistence);
    }
  });
  const collectorDependencies: CollectorHandlerDependencies<RuntimeEnvelope> = collectorService.dependencies;
  const collectorStore: CollectorEventStore<RuntimeEnvelope> = collectorService.store;

  const apiDependencies = {
    startedAtMs: options.startedAtMs,
    repository: sessionRepository,
    ...(options.dailyCostReader !== undefined ? { dailyCostReader: options.dailyCostReader } : {})
  } as const;

  return {
    sessionRepository,
    collectorStore,
    collectorDependencies,
    collectorService,
    persistence,
    ...(options.dailyCostReader !== undefined ? { dailyCostReader: options.dailyCostReader } : {}),
    handleCollectorRaw: collectorService.handleRaw,
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
  const enableCollectorServer = options.enableCollectorServer ?? true;
  const enableApiServer = options.enableApiServer ?? true;
  const enableOtelReceiver = options.enableOtelReceiver ?? enableCollectorServer;

  if (!enableCollectorServer && !enableApiServer) {
    throw new Error("runtime requires at least one enabled HTTP service");
  }

  const otelGrpcAddress = options.otelGrpcAddress ?? `${host}:4717`;
  const collectorServer = enableCollectorServer
    ? http.createServer(createCollectorHttpHandler(runtime.collectorDependencies))
    : undefined;
  const apiServer = enableApiServer
    ? http.createServer(
        createApiHttpHandler({
          startedAtMs: runtime.collectorDependencies.startedAtMs,
          repository: runtime.sessionRepository,
          ...(runtime.dailyCostReader !== undefined ? { dailyCostReader: runtime.dailyCostReader } : {})
        })
      )
    : undefined;
  let otelReceiver: OtelGrpcReceiverHandle | undefined;
  try {
    if (enableOtelReceiver) {
      otelReceiver = await startOtelGrpcReceiver({
        address: otelGrpcAddress,
        privacyTier: options.otelPrivacyTier ?? 2,
        sink: createRuntimeOtelSink(runtime)
      });
    }

    if (collectorServer !== undefined) {
      await listen(collectorServer, collectorPort, host);
    }
    if (apiServer !== undefined) {
      await listen(apiServer, apiPort, host);
    }
  } catch (error: unknown) {
    if (apiServer !== undefined) {
      await close(apiServer).catch(() => undefined);
    }
    if (collectorServer !== undefined) {
      await close(collectorServer).catch(() => undefined);
    }
    if (otelReceiver !== undefined) {
      await otelReceiver.close().catch(() => undefined);
    }
    throw error;
  }

  return {
    ...(collectorServer !== undefined ? { collectorAddress: toAddress(collectorServer) } : {}),
    ...(apiServer !== undefined ? { apiAddress: toAddress(apiServer) } : {}),
    ...(otelReceiver !== undefined ? { otelGrpcAddress: otelReceiver.address } : {}),
    close: async (): Promise<void> => {
      if (collectorServer !== undefined) {
        await close(collectorServer);
      }
      if (apiServer !== undefined) {
        await close(apiServer);
      }
      if (otelReceiver !== undefined) {
        await otelReceiver.close();
      }
    }
  };
}

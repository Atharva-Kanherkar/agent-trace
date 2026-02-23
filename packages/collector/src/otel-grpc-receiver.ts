import path from "node:path";

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

import { normalizeOtelExport } from "./otel-normalizer";
import type {
  OtelExportProcessDependencies,
  OtelExportProcessResult,
  OtelGrpcReceiverHandle,
  OtelGrpcReceiverOptions,
  OtelGrpcReceiverStats
} from "./types";

const OTLP_LOGS_PROTO_PATH = path.resolve(__dirname, "../../proto/otlp_logs_service.proto");

interface MutableOtelGrpcReceiverStats {
  exportCalls: number;
  normalizedEvents: number;
  droppedRecords: number;
  normalizationFailures: number;
  sinkFailures: number;
}

interface GrpcCallback {
  (error: grpc.ServiceError | null, value: unknown): void;
}

function toReadonlyStats(stats: MutableOtelGrpcReceiverStats): OtelGrpcReceiverStats {
  return {
    exportCalls: stats.exportCalls,
    normalizedEvents: stats.normalizedEvents,
    droppedRecords: stats.droppedRecords,
    normalizationFailures: stats.normalizationFailures,
    sinkFailures: stats.sinkFailures
  };
}

function parseHost(address: string): string {
  const lastColon = address.lastIndexOf(":");
  if (lastColon < 0) {
    return "0.0.0.0";
  }
  return address.slice(0, lastColon);
}

function loadLogsServiceDefinition(): grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  const packageDefinition = protoLoader.loadSync(OTLP_LOGS_PROTO_PATH, {
    longs: String,
    enums: String,
    defaults: false,
    oneofs: true
  });
  const grpcObject = grpc.loadPackageDefinition(packageDefinition) as Record<string, unknown>;
  const otel = grpcObject["opentelemetry"] as Record<string, unknown> | undefined;
  const protoNamespace = otel?.["proto"] as Record<string, unknown> | undefined;
  const collector = protoNamespace?.["collector"] as Record<string, unknown> | undefined;
  const logs = collector?.["logs"] as Record<string, unknown> | undefined;
  const v1 = logs?.["v1"] as Record<string, unknown> | undefined;
  const logsService = v1?.["LogsService"] as { service?: grpc.ServiceDefinition<grpc.UntypedServiceImplementation> };

  if (logsService?.service === undefined) {
    throw new Error("failed to load OTLP logs service definition");
  }
  return logsService.service;
}

export async function processOtelExportPayload(
  payload: unknown,
  dependencies: OtelExportProcessDependencies
): Promise<OtelExportProcessResult> {
  const normalized = normalizeOtelExport({
    payload,
    privacyTier: dependencies.privacyTier
  });

  const errors: string[] = [...normalized.errors];
  if (!normalized.ok && dependencies.onNormalizationErrors !== undefined) {
    dependencies.onNormalizationErrors(normalized.errors);
  }

  let sinkFailed = false;
  if (dependencies.sink !== undefined && normalized.events.length > 0) {
    try {
      await dependencies.sink.ingestOtelEvents(normalized.events);
    } catch (error: unknown) {
      sinkFailed = true;
      errors.push(`otel sink failed: ${String(error)}`);
    }
  }

  return {
    normalizedEvents: normalized.events.length,
    droppedRecords: normalized.droppedRecords,
    normalizationFailed: !normalized.ok,
    sinkFailed,
    errors
  };
}

export async function startOtelGrpcReceiver(options: OtelGrpcReceiverOptions = {}): Promise<OtelGrpcReceiverHandle> {
  const server = new grpc.Server();
  const address = options.address ?? "0.0.0.0:4717";
  const host = parseHost(address);

  const stats: MutableOtelGrpcReceiverStats = {
    exportCalls: 0,
    normalizedEvents: 0,
    droppedRecords: 0,
    normalizationFailures: 0,
    sinkFailures: 0
  };

  const handler = (
    call: grpc.ServerUnaryCall<unknown, unknown>,
    callback: GrpcCallback
  ): void => {
    stats.exportCalls += 1;

    void processOtelExportPayload(call.request, {
      privacyTier: options.privacyTier ?? 1,
      ...(options.sink !== undefined ? { sink: options.sink } : {}),
      ...(options.onNormalizationErrors !== undefined
        ? { onNormalizationErrors: options.onNormalizationErrors }
        : {})
    })
      .then((result) => {
        stats.normalizedEvents += result.normalizedEvents;
        stats.droppedRecords += result.droppedRecords;
        if (result.normalizationFailed) {
          stats.normalizationFailures += 1;
        }
        if (result.sinkFailed) {
          stats.sinkFailures += 1;
        }

        callback(null, {});
      })
      .catch((error: unknown) => {
        stats.sinkFailures += 1;
        const serviceError = Object.assign(new Error(String(error)), {
          name: "otel_export_failed",
          code: grpc.status.INTERNAL,
          details: String(error),
          metadata: new grpc.Metadata()
        }) as grpc.ServiceError;
        callback(serviceError, undefined);
      });
  };

  const logsServiceDefinition = loadLogsServiceDefinition();
  server.addService(logsServiceDefinition, {
    Export: handler
  });

  const boundPort = await new Promise<number>((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(port);
    });
  });

  return {
    address: `${host}:${String(boundPort)}`,
    getStats: (): OtelGrpcReceiverStats => toReadonlyStats(stats),
    close: async (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        server.tryShutdown((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

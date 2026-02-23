import http from "node:http";

import { createCollectorHttpHandler } from "./http";
import { startOtelGrpcReceiver } from "./otel-grpc-receiver";
import { createEnvelopeCollectorService } from "./envelope-service";
import type { StandaloneCollectorHandle, StandaloneCollectorStartOptions } from "./types";

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

async function closeServer(server: http.Server): Promise<void> {
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

export async function startStandaloneCollector(
  options: StandaloneCollectorStartOptions = {}
): Promise<StandaloneCollectorHandle> {
  const host = options.host ?? "127.0.0.1";
  const httpPort = options.httpPort ?? 8317;
  const otelGrpcAddress = options.otelGrpcAddress ?? `${host}:4717`;
  const privacyTier = options.privacyTier ?? 1;

  const service = createEnvelopeCollectorService({
    ...(options.startedAtMs !== undefined ? { startedAtMs: options.startedAtMs } : {}),
    ...(options.onAcceptedEvent !== undefined ? { onAcceptedEvent: options.onAcceptedEvent } : {}),
    ...(options.processor !== undefined ? { processor: options.processor } : {}),
    ...(options.enableTranscriptIngestion !== undefined
      ? { enableTranscriptIngestion: options.enableTranscriptIngestion }
      : {})
  });

  const collectorServer = http.createServer(createCollectorHttpHandler(service.dependencies));
  await listen(collectorServer, httpPort, host);

  try {
    const otelReceiver = await startOtelGrpcReceiver({
      address: otelGrpcAddress,
      privacyTier,
      sink: service.otelSink
    });

    return {
      httpAddress: toAddress(collectorServer),
      otelGrpcAddress: otelReceiver.address,
      service,
      otelReceiver,
      close: async (): Promise<void> => {
        await closeServer(collectorServer);
        await otelReceiver.close();
      }
    };
  } catch (error: unknown) {
    await closeServer(collectorServer);
    throw error;
  }
}

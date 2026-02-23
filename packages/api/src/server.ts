import http from "node:http";

import { createApiHttpHandler } from "./http";
import { InMemorySessionRepository } from "./repository";
import type { ApiHandlerDependencies, ApiServerHandle, ApiServerStartOptions } from "./types";

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

export function createApiDependencies(options: ApiServerStartOptions = {}): ApiHandlerDependencies {
  return {
    startedAtMs: options.startedAtMs ?? Date.now(),
    repository: options.repository ?? new InMemorySessionRepository()
  };
}

export async function startApiServer(options: ApiServerStartOptions = {}): Promise<ApiServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8318;
  const dependencies = createApiDependencies(options);
  const server = http.createServer(createApiHttpHandler(dependencies));

  await listen(server, port, host);

  return {
    address: toAddress(server),
    dependencies,
    close: async (): Promise<void> => {
      await close(server);
    }
  };
}

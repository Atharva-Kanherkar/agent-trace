import http from "node:http";

import { handleCollectorRequest } from "./handler";
import type {
  CollectorHandlerDependencies,
  CollectorRawHttpRequest,
  CollectorResponse,
  HttpMethod
} from "./types";

function normalizeMethod(method: string): HttpMethod | undefined {
  if (method === "GET" || method === "POST") {
    return method;
  }
  return undefined;
}

function parsePathname(url: string): string {
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.pathname;
  } catch {
    return url;
  }
}

export function handleCollectorRawHttpRequest<TEvent>(
  request: CollectorRawHttpRequest,
  dependencies: CollectorHandlerDependencies<TEvent>
): CollectorResponse {
  const method = normalizeMethod(request.method);
  if (method === undefined) {
    return {
      statusCode: 405,
      payload: {
        status: "error",
        message: "method not allowed"
      }
    };
  }

  const pathname = parsePathname(request.url);
  if (method === "POST" && pathname === "/v1/hooks") {
    const rawBody = request.rawBody ?? "";
    if (rawBody.trim().length === 0) {
      return handleCollectorRequest(
        {
          method,
          url: pathname,
          body: undefined
        },
        dependencies
      );
    }

    try {
      const body = JSON.parse(rawBody) as unknown;
      return handleCollectorRequest(
        {
          method,
          url: pathname,
          body
        },
        dependencies
      );
    } catch {
      return {
        statusCode: 400,
        payload: {
          status: "error",
          message: "invalid JSON body"
        }
      };
    }
  }

  return handleCollectorRequest(
    {
      method,
      url: pathname
    },
    dependencies
  );
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (error) => reject(error));
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const json = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(json);
}

export function createCollectorHttpHandler<TEvent>(
  dependencies: CollectorHandlerDependencies<TEvent>
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const rawBody = method === "POST" ? await readRequestBody(req) : undefined;

    const response = handleCollectorRawHttpRequest(
      {
        method,
        url,
        ...(rawBody !== undefined ? { rawBody } : {})
      },
      dependencies
    );

    sendJson(res, response.statusCode, response.payload);
  };
}


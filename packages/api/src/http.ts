import http from "node:http";

import { handleApiRequest } from "./handler";
import type { ApiHandlerDependencies, ApiMethod, ApiRawHttpRequest, ApiResponse } from "./types";

function normalizeMethod(method: string): ApiMethod | undefined {
  if (method === "GET") {
    return method;
  }
  return undefined;
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}

export function handleApiRawHttpRequest(
  request: ApiRawHttpRequest,
  dependencies: ApiHandlerDependencies
): ApiResponse {
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

  return handleApiRequest(
    {
      method,
      url: request.url
    },
    dependencies
  );
}

export function createApiHttpHandler(
  dependencies: ApiHandlerDependencies
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const response = handleApiRawHttpRequest(
      {
        method: req.method ?? "GET",
        url: req.url ?? "/"
      },
      dependencies
    );

    sendJson(res, response.statusCode, response.payload);
  };
}


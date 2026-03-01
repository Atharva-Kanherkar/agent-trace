import type { InsightsConfig, InsightsProvider, SessionInsight } from "../../schema/src/insights-types";
import { createLlmProvider } from "./insights-provider";
import { generateSessionInsight } from "./insights-generator";
import type {
  ApiHandlerDependencies,
  ApiResponse
} from "./types";

const insightsCache = new Map<string, SessionInsight>();

const VALID_PROVIDERS: readonly string[] = ["anthropic", "openai", "gemini", "openrouter"];

function isValidProvider(value: unknown): value is InsightsProvider {
  return typeof value === "string" && VALID_PROVIDERS.includes(value);
}

export function handleGetInsightsSettings(dependencies: ApiHandlerDependencies): ApiResponse {
  const accessor = dependencies.insightsConfigAccessor;
  if (accessor === undefined) {
    return {
      statusCode: 200,
      payload: { status: "ok", configured: false }
    };
  }
  const config = accessor.getConfig();
  if (config === undefined) {
    return {
      statusCode: 200,
      payload: { status: "ok", configured: false }
    };
  }
  return {
    statusCode: 200,
    payload: {
      status: "ok",
      configured: true,
      provider: config.provider,
      ...(config.model !== undefined ? { model: config.model } : {})
    }
  };
}

export async function handlePostInsightsSettings(
  body: unknown,
  dependencies: ApiHandlerDependencies
): Promise<ApiResponse> {
  const accessor = dependencies.insightsConfigAccessor;
  if (accessor === undefined) {
    return {
      statusCode: 500,
      payload: { status: "error", message: "insights settings not available" }
    };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "request body must be a JSON object" }
    };
  }

  const record = body as Record<string, unknown>;
  const provider = record["provider"];
  const apiKey = record["apiKey"];
  const model = record["model"];

  if (!isValidProvider(provider)) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "invalid provider. must be one of: anthropic, openai, gemini, openrouter" }
    };
  }

  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "apiKey is required" }
    };
  }

  const config: InsightsConfig = {
    provider,
    apiKey,
    ...(typeof model === "string" && model.length > 0 ? { model } : {})
  };

  const llm = createLlmProvider(config);
  const valid = await llm.validate();
  if (!valid) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "API key validation failed. Check your key and try again." }
    };
  }

  accessor.setConfig(config);

  return {
    statusCode: 200,
    payload: {
      status: "ok",
      message: "insights configuration saved",
      provider: config.provider,
      model: llm.model
    }
  };
}

export async function handlePostSessionInsight(
  sessionId: string,
  dependencies: ApiHandlerDependencies
): Promise<ApiResponse> {
  const accessor = dependencies.insightsConfigAccessor;
  if (accessor === undefined) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "insights not configured" }
    };
  }

  const config = accessor.getConfig();
  if (config === undefined) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "no AI provider configured. open settings to add your API key." }
    };
  }

  // Check cache
  const cached = insightsCache.get(sessionId);
  if (cached !== undefined) {
    return {
      statusCode: 200,
      payload: { status: "ok", insight: cached }
    };
  }

  const trace = dependencies.repository.getBySessionId(sessionId);
  if (trace === undefined) {
    return {
      statusCode: 404,
      payload: { status: "error", message: "session not found" }
    };
  }

  const provider = createLlmProvider(config);
  const insight = await generateSessionInsight(trace, provider);

  insightsCache.set(sessionId, insight);

  return {
    statusCode: 200,
    payload: { status: "ok", insight }
  };
}

import type { InsightsConfig, InsightsProvider, SessionInsight, TeamInsight, TeamInsightsContext } from "../../schema/src/insights-types";
import { createLlmProvider } from "./insights-provider";
import { generateSessionInsight } from "./insights-generator";
import { generateTeamInsight } from "./team-insights-generator";
import type {
  ApiHandlerDependencies,
  ApiResponse,
  SessionFilters
} from "./types";

const insightsCache = new Map<string, SessionInsight>();
let teamInsightCache: TeamInsight | undefined;

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

export async function handlePostTeamInsight(
  searchParams: URLSearchParams,
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

  // Use cached result if available and fresh (5 minutes), unless force=true
  const forceRegenerate = searchParams.get("force") === "true";
  if (!forceRegenerate && teamInsightCache !== undefined) {
    const age = Date.now() - Date.parse(teamInsightCache.generatedAt);
    if (age < 5 * 60 * 1000) {
      return {
        statusCode: 200,
        payload: { status: "ok", insight: teamInsightCache }
      };
    }
  }

  // Gather team data
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const from = fromParam !== null && fromParam.length === 10 ? fromParam : `${year}-${month}-01`;
  const to = toParam !== null && toParam.length === 10 ? toParam : `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

  const filters: SessionFilters = { from, to };
  const traces = dependencies.repository.list(filters);

  if (traces.length === 0) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "no session data available for the selected period" }
    };
  }

  const provider = createLlmProvider(config);
  const teamContext = accessor.getTeamInsightsContext();
  const insight = await generateTeamInsight(traces, from, to, provider, teamContext);

  teamInsightCache = insight;

  return {
    statusCode: 200,
    payload: { status: "ok", insight }
  };
}

export function handleGetTeamInsightsContext(dependencies: ApiHandlerDependencies): ApiResponse {
  const accessor = dependencies.insightsConfigAccessor;
  if (accessor === undefined) {
    return {
      statusCode: 200,
      payload: { status: "ok", configured: false }
    };
  }
  const context = accessor.getTeamInsightsContext();
  if (context === undefined) {
    return {
      statusCode: 200,
      payload: { status: "ok", configured: false }
    };
  }
  return {
    statusCode: 200,
    payload: { status: "ok", configured: true, context }
  };
}

export function handlePostTeamInsightsContext(
  body: unknown,
  dependencies: ApiHandlerDependencies
): ApiResponse {
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
  const companyContext = typeof record["companyContext"] === "string" ? record["companyContext"] : "";
  const analysisGuidelines = typeof record["analysisGuidelines"] === "string" ? record["analysisGuidelines"] : "";

  if (companyContext.length === 0 && analysisGuidelines.length === 0) {
    return {
      statusCode: 400,
      payload: { status: "error", message: "at least one of companyContext or analysisGuidelines is required" }
    };
  }

  const context: TeamInsightsContext = {
    companyContext,
    analysisGuidelines,
    updatedAt: new Date().toISOString()
  };

  accessor.setTeamInsightsContext(context);

  return {
    statusCode: 200,
    payload: { status: "ok" }
  };
}

import type { InsightsConfig, InsightsProvider } from "../../schema/src/insights-types";

export interface LlmProvider {
  complete(system: string, user: string, maxTokens?: number): Promise<string>;
  validate(): Promise<boolean>;
  readonly model: string;
  readonly provider: InsightsProvider;
}

const DEFAULT_MODELS: Record<InsightsProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  openrouter: "anthropic/claude-sonnet-4"
};

function extractTextContent(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const record = body as Record<string, unknown>;

  // Anthropic: { content: [{ type: "text", text: "..." }] }
  if (Array.isArray(record["content"])) {
    for (const block of record["content"]) {
      if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        if (b["type"] === "text" && typeof b["text"] === "string") return b["text"];
      }
    }
  }

  // OpenAI / OpenRouter: { choices: [{ message: { content: "..." } }] }
  if (Array.isArray(record["choices"])) {
    const first = record["choices"][0];
    if (typeof first === "object" && first !== null) {
      const choice = first as Record<string, unknown>;
      const msg = choice["message"];
      if (typeof msg === "object" && msg !== null) {
        const m = msg as Record<string, unknown>;
        if (typeof m["content"] === "string") return m["content"];
      }
    }
  }

  // Gemini: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  if (Array.isArray(record["candidates"])) {
    const first = record["candidates"][0];
    if (typeof first === "object" && first !== null) {
      const candidate = first as Record<string, unknown>;
      const content = candidate["content"];
      if (typeof content === "object" && content !== null) {
        const c = content as Record<string, unknown>;
        if (Array.isArray(c["parts"])) {
          for (const part of c["parts"]) {
            if (typeof part === "object" && part !== null) {
              const p = part as Record<string, unknown>;
              if (typeof p["text"] === "string") return p["text"];
            }
          }
        }
      }
    }
  }

  return "";
}

function createAnthropicProvider(apiKey: string, model: string): LlmProvider {
  const endpoint = "https://api.anthropic.com/v1/messages";

  return {
    provider: "anthropic",
    model,
    async complete(system: string, user: string, maxTokens?: number): Promise<string> {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens ?? 1024,
          system,
          messages: [{ role: "user", content: user }]
        })
      });
      if (!response.ok) {
        throw new Error(`anthropic api returned ${String(response.status)}`);
      }
      const body = await response.json();
      return extractTextContent(body);
    },
    async validate(): Promise<boolean> {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }]
          })
        });
        return response.ok || response.status === 400;
      } catch {
        return false;
      }
    }
  };
}

function createOpenAiProvider(apiKey: string, model: string): LlmProvider {
  const endpoint = "https://api.openai.com/v1/chat/completions";

  return {
    provider: "openai",
    model,
    async complete(system: string, user: string, maxTokens?: number): Promise<string> {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens ?? 1024,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`openai api returned ${String(response.status)}`);
      }
      const body = await response.json();
      return extractTextContent(body);
    },
    async validate(): Promise<boolean> {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }]
          })
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  };
}

function createGeminiProvider(apiKey: string, model: string): LlmProvider {
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  return {
    provider: "gemini",
    model,
    async complete(system: string, user: string, maxTokens?: number): Promise<string> {
      const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens ?? 1024 }
        })
      });
      if (!response.ok) {
        throw new Error(`gemini api returned ${String(response.status)}`);
      }
      const body = await response.json();
      return extractTextContent(body);
    },
    async validate(): Promise<boolean> {
      try {
        const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
            generationConfig: { maxOutputTokens: 1 }
          })
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  };
}

function createOpenRouterProvider(apiKey: string, model: string): LlmProvider {
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";

  return {
    provider: "openrouter",
    model,
    async complete(system: string, user: string, maxTokens?: number): Promise<string> {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens ?? 1024,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`openrouter api returned ${String(response.status)}`);
      }
      const body = await response.json();
      return extractTextContent(body);
    },
    async validate(): Promise<boolean> {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }]
          })
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  };
}

export function createLlmProvider(config: InsightsConfig): LlmProvider {
  const model = config.model ?? DEFAULT_MODELS[config.provider];

  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config.apiKey, model);
    case "openai":
      return createOpenAiProvider(config.apiKey, model);
    case "gemini":
      return createGeminiProvider(config.apiKey, model);
    case "openrouter":
      return createOpenRouterProvider(config.apiKey, model);
  }
}

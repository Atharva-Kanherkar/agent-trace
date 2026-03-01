export type InsightsProvider = "anthropic" | "openai" | "gemini" | "openrouter";

export interface InsightsConfig {
  readonly provider: InsightsProvider;
  readonly apiKey: string;
  readonly model?: string;
}

export interface SessionInsight {
  readonly sessionId: string;
  readonly generatedAt: string;
  readonly provider: InsightsProvider;
  readonly model: string;
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly suggestions: readonly string[];
  readonly costNote?: string;
}

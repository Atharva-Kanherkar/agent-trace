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

export interface TeamInsightMemberHighlight {
  readonly userId: string;
  readonly displayName: string | null;
  readonly strength: string;
  readonly concern: string | null;
  readonly recommendation: string;
}

export interface TeamInsightsContext {
  readonly companyContext: string;
  readonly analysisGuidelines: string;
  readonly updatedAt: string;
}

export interface TeamInsight {
  readonly generatedAt: string;
  readonly provider: InsightsProvider;
  readonly model: string;
  readonly executiveSummary: string;
  readonly costAnalysis: string;
  readonly productivityAnalysis: string;
  readonly memberHighlights: readonly TeamInsightMemberHighlight[];
  readonly risks: readonly string[];
  readonly recommendations: readonly string[];
  readonly forecast: string | null;
}

/**
 * Anthropic model pricing (USD per token).
 *
 * Source: https://docs.anthropic.com/en/docs/about-claude/models
 * Last updated: 2026-02-26
 */

export interface ModelPricing {
  /** USD per input token */
  readonly inputPerToken: number;
  /** USD per output token */
  readonly outputPerToken: number;
  /** USD per cache-read input token (cheaper than regular input) */
  readonly cacheReadPerToken: number;
  /** USD per cache-write input token */
  readonly cacheWritePerToken: number;
}

/**
 * Pricing keyed by model-family prefix.
 * Matching is done longest-prefix-first so "claude-sonnet-4-6" matches
 * before "claude-sonnet-4".
 */
const MODEL_PRICING: readonly (readonly [pattern: string, pricing: ModelPricing])[] = [
  // Opus 4 / 4.6
  ["claude-opus-4", {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cacheReadPerToken: 1.50 / 1_000_000,
    cacheWritePerToken: 18.75 / 1_000_000
  }],

  // Sonnet 4 / 4.6
  ["claude-sonnet-4", {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.30 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000
  }],

  // Haiku 4.5
  ["claude-haiku-4", {
    inputPerToken: 0.80 / 1_000_000,
    outputPerToken: 4 / 1_000_000,
    cacheReadPerToken: 0.08 / 1_000_000,
    cacheWritePerToken: 1 / 1_000_000
  }],

  // Claude 3.5 Sonnet
  ["claude-3-5-sonnet", {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.30 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000
  }],

  // Claude 3.5 Haiku
  ["claude-3-5-haiku", {
    inputPerToken: 0.80 / 1_000_000,
    outputPerToken: 4 / 1_000_000,
    cacheReadPerToken: 0.08 / 1_000_000,
    cacheWritePerToken: 1 / 1_000_000
  }],

  // Claude 3 Opus
  ["claude-3-opus", {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cacheReadPerToken: 1.50 / 1_000_000,
    cacheWritePerToken: 18.75 / 1_000_000
  }],

  // Claude 3 Sonnet
  ["claude-3-sonnet", {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.30 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000
  }],

  // Claude 3 Haiku
  ["claude-3-haiku", {
    inputPerToken: 0.25 / 1_000_000,
    outputPerToken: 1.25 / 1_000_000,
    cacheReadPerToken: 0.03 / 1_000_000,
    cacheWritePerToken: 0.30 / 1_000_000
  }]
];

// Sorted longest-prefix-first for correct matching
const SORTED_PRICING = [...MODEL_PRICING].sort((a, b) => b[0].length - a[0].length);

/**
 * Look up pricing for a model ID.
 * Returns undefined if the model is not recognized.
 */
export function lookupModelPricing(model: string): ModelPricing | undefined {
  const normalized = model.toLowerCase();
  for (const [pattern, pricing] of SORTED_PRICING) {
    if (normalized.startsWith(pattern)) {
      return pricing;
    }
  }
  return undefined;
}

export interface CostCalculationInput {
  readonly model?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

/**
 * Calculate cost in USD from token counts and model.
 * Returns 0 if the model is unknown or no tokens are present.
 *
 * Anthropic's usage object:
 *   input_tokens = total input (includes cached tokens)
 *   cache_read_input_tokens = subset of input served from cache
 *   cache_creation_input_tokens = subset of input written to cache
 *
 * Cost = (regular_input * input_rate) + (cache_read * cache_read_rate)
 *      + (cache_write * cache_write_rate) + (output * output_rate)
 *
 * where regular_input = input_tokens - cache_read - cache_write
 */
export function calculateCostUsd(input: CostCalculationInput): number {
  if (input.model === undefined) {
    return 0;
  }

  const pricing = lookupModelPricing(input.model);
  if (pricing === undefined) {
    return 0;
  }

  const totalInput = Math.max(0, input.inputTokens);
  const output = Math.max(0, input.outputTokens);
  const cacheRead = Math.max(0, input.cacheReadTokens ?? 0);
  const cacheWrite = Math.max(0, input.cacheWriteTokens ?? 0);
  const regularInput = Math.max(0, totalInput - cacheRead - cacheWrite);

  const cost =
    regularInput * pricing.inputPerToken +
    cacheRead * pricing.cacheReadPerToken +
    cacheWrite * pricing.cacheWritePerToken +
    output * pricing.outputPerToken;

  return Number(cost.toFixed(6));
}

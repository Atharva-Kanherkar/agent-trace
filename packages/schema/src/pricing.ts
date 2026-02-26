/**
 * Anthropic model pricing (USD per token).
 *
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 * Last verified: 2026-02-26
 *
 * Anthropic's usage object reports THREE separate token counts:
 *   input_tokens                  – regular (non-cached) input
 *   cache_read_input_tokens       – served from cache  (separate, NOT a subset)
 *   cache_creation_input_tokens   – written to cache   (separate, NOT a subset)
 *
 * Total cost = input_tokens          * base_input_rate
 *            + cache_read_tokens     * cache_read_rate
 *            + cache_creation_tokens * cache_write_rate
 *            + output_tokens         * output_rate
 */

export interface ModelPricing {
  /** USD per non-cached input token */
  readonly inputPerToken: number;
  /** USD per output token */
  readonly outputPerToken: number;
  /** USD per cache-read input token (0.1× base input) */
  readonly cacheReadPerToken: number;
  /** USD per 5-min cache-write input token (1.25× base input) */
  readonly cacheWritePerToken: number;
}

/**
 * Pricing keyed by model-family prefix.
 * Matching is longest-prefix-first so "claude-opus-4-5" matches before "claude-opus-4".
 */
const MODEL_PRICING: readonly (readonly [pattern: string, pricing: ModelPricing])[] = [
  // ── Opus family ──────────────────────────────────────────
  // Opus 4.5 / 4.6 — $5 in, $25 out
  ["claude-opus-4-6", {
    inputPerToken: 5 / 1_000_000,
    outputPerToken: 25 / 1_000_000,
    cacheReadPerToken: 0.50 / 1_000_000,
    cacheWritePerToken: 6.25 / 1_000_000
  }],
  ["claude-opus-4-5", {
    inputPerToken: 5 / 1_000_000,
    outputPerToken: 25 / 1_000_000,
    cacheReadPerToken: 0.50 / 1_000_000,
    cacheWritePerToken: 6.25 / 1_000_000
  }],
  // Opus 4.1 / 4.0 — $15 in, $75 out
  ["claude-opus-4-1", {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cacheReadPerToken: 1.50 / 1_000_000,
    cacheWritePerToken: 18.75 / 1_000_000
  }],
  ["claude-opus-4", {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cacheReadPerToken: 1.50 / 1_000_000,
    cacheWritePerToken: 18.75 / 1_000_000
  }],

  // ── Sonnet family ────────────────────────────────────────
  // Sonnet 4.x — $3 in, $15 out
  ["claude-sonnet-4", {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.30 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000
  }],

  // ── Haiku family ─────────────────────────────────────────
  // Haiku 4.5 — $1 in, $5 out
  ["claude-haiku-4", {
    inputPerToken: 1 / 1_000_000,
    outputPerToken: 5 / 1_000_000,
    cacheReadPerToken: 0.10 / 1_000_000,
    cacheWritePerToken: 1.25 / 1_000_000
  }],

  // ── Legacy 3.x models ───────────────────────────────────
  ["claude-3-5-sonnet", {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.30 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000
  }],
  ["claude-3-5-haiku", {
    inputPerToken: 0.80 / 1_000_000,
    outputPerToken: 4 / 1_000_000,
    cacheReadPerToken: 0.08 / 1_000_000,
    cacheWritePerToken: 1 / 1_000_000
  }],
  ["claude-3-opus", {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cacheReadPerToken: 1.50 / 1_000_000,
    cacheWritePerToken: 18.75 / 1_000_000
  }],
  ["claude-3-sonnet", {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.30 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000
  }],
  ["claude-3-haiku", {
    inputPerToken: 0.25 / 1_000_000,
    outputPerToken: 1.25 / 1_000_000,
    cacheReadPerToken: 0.03 / 1_000_000,
    cacheWritePerToken: 0.30 / 1_000_000
  }]
];

// Sort longest-prefix-first for correct matching
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
  /** Non-cached input tokens (usage.input_tokens) */
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** usage.cache_read_input_tokens — SEPARATE from inputTokens */
  readonly cacheReadTokens?: number;
  /** usage.cache_creation_input_tokens — SEPARATE from inputTokens */
  readonly cacheWriteTokens?: number;
}

/**
 * Calculate cost in USD from token counts and model.
 * Returns 0 if the model is unknown or no tokens are present.
 *
 * All three input counts are ADDITIVE (not overlapping):
 *   cost = inputTokens     * base_input_rate
 *        + cacheReadTokens  * cache_read_rate   (0.1× base)
 *        + cacheWriteTokens * cache_write_rate   (1.25× base)
 *        + outputTokens     * output_rate
 */
export function calculateCostUsd(input: CostCalculationInput): number {
  if (input.model === undefined) {
    return 0;
  }

  const pricing = lookupModelPricing(input.model);
  if (pricing === undefined) {
    return 0;
  }

  const baseInput = Math.max(0, input.inputTokens);
  const output = Math.max(0, input.outputTokens);
  const cacheRead = Math.max(0, input.cacheReadTokens ?? 0);
  const cacheWrite = Math.max(0, input.cacheWriteTokens ?? 0);

  const cost =
    baseInput * pricing.inputPerToken +
    cacheRead * pricing.cacheReadPerToken +
    cacheWrite * pricing.cacheWritePerToken +
    output * pricing.outputPerToken;

  return Number(cost.toFixed(6));
}

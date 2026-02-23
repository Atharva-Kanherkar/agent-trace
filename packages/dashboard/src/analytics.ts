import type { AgentSessionTrace } from "../../schema/src/types";
import type { CostSummary } from "./types";

export function summarizeCost(traces: readonly AgentSessionTrace[]): CostSummary {
  if (traces.length === 0) {
    return {
      totalCostUsd: 0,
      averageCostUsd: 0,
      highestCostSessionId: null
    };
  }

  let totalCost = 0;
  let highestCost = -1;
  let highestCostSessionId: string | null = null;

  traces.forEach((trace) => {
    const cost = trace.metrics.totalCostUsd;
    totalCost += cost;
    if (cost > highestCost) {
      highestCost = cost;
      highestCostSessionId = trace.sessionId;
    }
  });

  return {
    totalCostUsd: Number(totalCost.toFixed(6)),
    averageCostUsd: Number((totalCost / traces.length).toFixed(6)),
    highestCostSessionId
  };
}


import type { AgentSessionTrace } from "../../schema/src/types";
import type { ApiSessionRepository, SessionFilters } from "./types";

export class InMemorySessionRepository implements ApiSessionRepository {
  private readonly tracesById: Map<string, AgentSessionTrace>;

  public constructor(seedTraces: readonly AgentSessionTrace[] = []) {
    this.tracesById = new Map<string, AgentSessionTrace>();
    seedTraces.forEach((trace) => {
      this.tracesById.set(trace.sessionId, trace);
    });
  }

  public list(filters: SessionFilters): readonly AgentSessionTrace[] {
    const traces = [...this.tracesById.values()];

    return traces.filter((trace) => {
      if (filters.userId !== undefined && trace.user.id !== filters.userId) {
        return false;
      }

      if (filters.repo !== undefined && trace.environment.gitRepo !== filters.repo) {
        return false;
      }

      return true;
    });
  }

  public getBySessionId(sessionId: string): AgentSessionTrace | undefined {
    return this.tracesById.get(sessionId);
  }

  public upsert(trace: AgentSessionTrace): void {
    this.tracesById.set(trace.sessionId, trace);
  }
}


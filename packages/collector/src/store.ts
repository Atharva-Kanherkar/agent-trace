import type { CollectorEventStore, CollectorIngestResult, CollectorStats } from "./types";

export class InMemoryCollectorStore<TEvent> implements CollectorEventStore<TEvent> {
  private readonly seenEventIds: Set<string>;
  private readonly events: Map<string, TEvent>;
  private dedupedEventsCount: number;

  public constructor() {
    this.seenEventIds = new Set<string>();
    this.events = new Map<string, TEvent>();
    this.dedupedEventsCount = 0;
  }

  public ingest(event: TEvent, eventId: string): CollectorIngestResult {
    if (this.seenEventIds.has(eventId)) {
      this.dedupedEventsCount += 1;
      return {
        accepted: false,
        deduped: true
      };
    }

    this.seenEventIds.add(eventId);
    this.events.set(eventId, event);

    return {
      accepted: true,
      deduped: false
    };
  }

  public getStats(): CollectorStats {
    return {
      storedEvents: this.events.size,
      dedupedEvents: this.dedupedEventsCount
    };
  }

  public clear(): void {
    this.seenEventIds.clear();
    this.events.clear();
    this.dedupedEventsCount = 0;
  }
}


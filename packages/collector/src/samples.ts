export interface SampleCollectorEvent {
  readonly eventId: string;
  readonly sessionId: string;
  readonly eventType: string;
}

export function createSampleCollectorEvent(overrides: Partial<SampleCollectorEvent> = {}): SampleCollectorEvent {
  return {
    eventId: "evt_001",
    sessionId: "sess_001",
    eventType: "tool_result",
    ...overrides
  };
}


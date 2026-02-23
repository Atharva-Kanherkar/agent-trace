import { createSampleEvent, createSampleTrace, validateEventEnvelope, validateSessionTrace } from "../src";

function fail(message: string): never {
  throw new Error(message);
}

function main(): void {
  const event = createSampleEvent({
    eventId: "evt_manual_001",
    sessionId: "sess_manual_001"
  });
  const trace = createSampleTrace({
    sessionId: "sess_manual_001"
  });

  const eventResult = validateEventEnvelope(event);
  if (!eventResult.ok) {
    fail(`event validation failed: ${eventResult.errors.join(" | ")}`);
  }

  const traceResult = validateSessionTrace(trace);
  if (!traceResult.ok) {
    fail(`session trace validation failed: ${traceResult.errors.join(" | ")}`);
  }

  console.log("schema manual smoke passed");
  console.log(`eventId=${eventResult.value.eventId}`);
  console.log(`sessionId=${traceResult.value.sessionId}`);
}

main();


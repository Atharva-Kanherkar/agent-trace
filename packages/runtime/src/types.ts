import type { ApiRawHttpRequest, ApiResponse } from "../../api/src/types";
import type { CollectorRawHttpRequest, CollectorResponse } from "../../collector/src/types";
import type { EventEnvelope } from "../../schema/src/types";

export interface RuntimeEnvelopePayload extends Readonly<Record<string, unknown>> {}

export type RuntimeEnvelope = EventEnvelope<RuntimeEnvelopePayload>;

export interface RuntimeRequestHandlers {
  handleCollectorRaw(request: CollectorRawHttpRequest): CollectorResponse;
  handleApiRaw(request: ApiRawHttpRequest): ApiResponse;
}

export interface RuntimeStartOptions {
  readonly host?: string;
  readonly collectorPort?: number;
  readonly apiPort?: number;
}

export interface RuntimeStartedServers {
  readonly collectorAddress: string;
  readonly apiAddress: string;
  close(): Promise<void>;
}


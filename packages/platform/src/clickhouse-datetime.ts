const DATE_TIME64_FRACTION_DIGITS = 3;

function pad(value: number, size: number): string {
  return value.toString().padStart(size, "0");
}

function formatUtcDateTime64(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1, 2);
  const day = pad(date.getUTCDate(), 2);
  const hours = pad(date.getUTCHours(), 2);
  const minutes = pad(date.getUTCMinutes(), 2);
  const seconds = pad(date.getUTCSeconds(), 2);
  const milliseconds = pad(date.getUTCMilliseconds(), DATE_TIME64_FRACTION_DIGITS);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function toClickHouseDateTime64(value: string): string {
  const timestampMs = Date.parse(value);
  if (Number.isNaN(timestampMs)) {
    throw new Error(`Invalid date-time value for ClickHouse DateTime64: ${value}`);
  }
  return formatUtcDateTime64(timestampMs);
}

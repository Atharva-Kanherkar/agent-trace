import assert from "node:assert/strict";
import test from "node:test";

import { parseRuntimeDatabaseConfigFromEnv } from "../src/env";

test("parseRuntimeDatabaseConfigFromEnv returns undefined when required vars are missing", () => {
  const config = parseRuntimeDatabaseConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123"
  });

  assert.equal(config, undefined);
});

test("parseRuntimeDatabaseConfigFromEnv parses required and optional vars", () => {
  const config = parseRuntimeDatabaseConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    CLICKHOUSE_USERNAME: "default",
    CLICKHOUSE_PASSWORD: "secret",
    CLICKHOUSE_DATABASE: "agent_trace",
    POSTGRES_CONNECTION_STRING: "postgres://postgres:postgres@127.0.0.1:5432/agent_trace",
    POSTGRES_SSL: "true",
    POSTGRES_MAX_POOL_SIZE: "25"
  });

  assert.notEqual(config, undefined);
  if (config === undefined) {
    assert.fail("expected parsed database config");
  }

  assert.equal(config.clickHouse.url, "http://127.0.0.1:8123");
  assert.equal(config.clickHouse.username, "default");
  assert.equal(config.clickHouse.password, "secret");
  assert.equal(config.clickHouse.database, "agent_trace");
  assert.equal(
    config.postgres.connectionString,
    "postgres://postgres:postgres@127.0.0.1:5432/agent_trace"
  );
  assert.equal(config.postgres.ssl, true);
  assert.equal(config.postgres.maxPoolSize, 25);
});

test("parseRuntimeDatabaseConfigFromEnv ignores invalid optional values", () => {
  const config = parseRuntimeDatabaseConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    POSTGRES_CONNECTION_STRING: "postgres://postgres:postgres@127.0.0.1:5432/agent_trace",
    POSTGRES_SSL: "invalid",
    POSTGRES_MAX_POOL_SIZE: "-1"
  });

  assert.notEqual(config, undefined);
  if (config === undefined) {
    assert.fail("expected parsed database config");
  }

  assert.equal("ssl" in config.postgres, false);
  assert.equal("maxPoolSize" in config.postgres, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { runRuntimeDatabaseMigrations } from "../src/migrations";
import type { RuntimeDatabaseConfig } from "../src/types";

test("runRuntimeDatabaseMigrations forwards database config to migration runner", async () => {
  const config: RuntimeDatabaseConfig = {
    clickHouse: {
      url: "http://127.0.0.1:8123",
      username: "default",
      password: "agent_trace",
      database: "agent_trace"
    },
    postgres: {
      connectionString: "postgres://agent_trace:agent_trace@127.0.0.1:5432/agent_trace"
    }
  };

  const received: unknown[] = [];
  const result = await runRuntimeDatabaseMigrations(config, async (options) => {
    received.push(options);
    return {
      clickHouse: {
        database: "clickhouse",
        executedFiles: 3,
        executedStatements: 4
      },
      postgres: {
        database: "postgres",
        executedFiles: 3,
        executedStatements: 4
      }
    };
  });

  assert.equal(received.length, 1);
  const forwarded = received[0] as {
    readonly clickHouse: RuntimeDatabaseConfig["clickHouse"];
    readonly postgres: RuntimeDatabaseConfig["postgres"];
  };
  assert.equal(forwarded.clickHouse.url, "http://127.0.0.1:8123");
  assert.equal(
    forwarded.postgres.connectionString,
    "postgres://agent_trace:agent_trace@127.0.0.1:5432/agent_trace"
  );
  assert.equal(result.clickHouse.executedStatements, 4);
  assert.equal(result.postgres.executedStatements, 4);
});

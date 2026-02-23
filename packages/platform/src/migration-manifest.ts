import path from "node:path";

import type { MigrationManifest } from "./types";

const ROOT_DIR = path.resolve(__dirname, "../../../../");

export function getMigrationManifest(): MigrationManifest {
  return {
    entries: [
      {
        database: "clickhouse",
        version: "001",
        filePath: path.join(ROOT_DIR, "migrations/clickhouse/001_agent_events.sql")
      },
      {
        database: "clickhouse",
        version: "002",
        filePath: path.join(ROOT_DIR, "migrations/clickhouse/002_session_traces.sql")
      },
      {
        database: "clickhouse",
        version: "003",
        filePath: path.join(ROOT_DIR, "migrations/clickhouse/003_materialized_views.sql")
      },
      {
        database: "postgres",
        version: "001",
        filePath: path.join(ROOT_DIR, "migrations/postgres/001_users.sql")
      },
      {
        database: "postgres",
        version: "002",
        filePath: path.join(ROOT_DIR, "migrations/postgres/002_sessions_commits.sql")
      },
      {
        database: "postgres",
        version: "003",
        filePath: path.join(ROOT_DIR, "migrations/postgres/003_instance_settings.sql")
      }
    ]
  };
}

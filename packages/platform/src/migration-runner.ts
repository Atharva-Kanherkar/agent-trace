import fs from "node:fs";

import { createClient } from "@clickhouse/client";
import { Pool, type PoolConfig } from "pg";

import type { ClickHouseConnectionOptions, PostgresConnectionOptions } from "./persistence-types";
import { getMigrationManifest } from "./migration-manifest";
import type {
  MigrationDatabase,
  MigrationDatabaseRunSummary,
  MigrationFileEntry,
  MigrationFileReader,
  PlatformMigrationsRunResult,
  RunPlatformMigrationsOptions,
  SqlMigrationExecutor
} from "./types";

class FileSystemMigrationFileReader implements MigrationFileReader {
  public read(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }
}

class ClickHouseSqlMigrationExecutor implements SqlMigrationExecutor {
  private readonly client: ReturnType<typeof createClient>;

  public constructor(options: ClickHouseConnectionOptions) {
    this.client = createClient({
      url: options.url,
      ...(options.username !== undefined ? { username: options.username } : {}),
      ...(options.password !== undefined ? { password: options.password } : {}),
      ...(options.database !== undefined ? { database: options.database } : {})
    });
  }

  public async execute(statement: string): Promise<void> {
    await this.client.command({
      query: statement
    });
  }

  public async close(): Promise<void> {
    await this.client.close();
  }
}

class PostgresSqlMigrationExecutor implements SqlMigrationExecutor {
  private readonly pool: Pool;

  public constructor(options: PostgresConnectionOptions) {
    const poolConfig: PoolConfig = {};
    if (options.connectionString !== undefined) {
      poolConfig.connectionString = options.connectionString;
    }
    if (options.host !== undefined) {
      poolConfig.host = options.host;
    }
    if (options.port !== undefined) {
      poolConfig.port = options.port;
    }
    if (options.user !== undefined) {
      poolConfig.user = options.user;
    }
    if (options.password !== undefined) {
      poolConfig.password = options.password;
    }
    if (options.database !== undefined) {
      poolConfig.database = options.database;
    }
    if (options.maxPoolSize !== undefined) {
      poolConfig.max = options.maxPoolSize;
    }
    if (options.ssl === true) {
      poolConfig.ssl = {
        rejectUnauthorized: false
      };
    }

    this.pool = new Pool(poolConfig);
  }

  public async execute(statement: string): Promise<void> {
    await this.pool.query(statement);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

function byDatabaseAndVersion(
  entries: readonly MigrationFileEntry[],
  database: MigrationDatabase
): readonly MigrationFileEntry[] {
  return entries.filter((entry) => entry.database === database).sort((a, b) => a.version.localeCompare(b.version));
}

export function splitSqlStatements(sql: string): readonly string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function runDatabaseMigrations(options: {
  readonly database: MigrationDatabase;
  readonly entries: readonly MigrationFileEntry[];
  readonly executor: SqlMigrationExecutor;
  readonly fileReader?: MigrationFileReader;
}): Promise<MigrationDatabaseRunSummary> {
  const reader = options.fileReader ?? new FileSystemMigrationFileReader();
  let executedFiles = 0;
  let executedStatements = 0;

  try {
    for (const entry of options.entries) {
      const sql = reader.read(entry.filePath);
      const statements = splitSqlStatements(sql);
      if (statements.length === 0) {
        continue;
      }

      executedFiles += 1;
      for (const statement of statements) {
        await options.executor.execute(statement);
        executedStatements += 1;
      }
    }

    return {
      database: options.database,
      executedFiles,
      executedStatements
    };
  } finally {
    await options.executor.close();
  }
}

export async function runPlatformMigrations(
  options: RunPlatformMigrationsOptions
): Promise<PlatformMigrationsRunResult> {
  const manifest = options.manifest ?? getMigrationManifest();

  const clickHouseSummary = await runDatabaseMigrations({
    database: "clickhouse",
    entries: byDatabaseAndVersion(manifest.entries, "clickhouse"),
    executor: new ClickHouseSqlMigrationExecutor(options.clickHouse)
  });

  const postgresSummary = await runDatabaseMigrations({
    database: "postgres",
    entries: byDatabaseAndVersion(manifest.entries, "postgres"),
    executor: new PostgresSqlMigrationExecutor(options.postgres)
  });

  return {
    clickHouse: clickHouseSummary,
    postgres: postgresSummary
  };
}

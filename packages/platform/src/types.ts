import type { ClickHouseConnectionOptions, PostgresConnectionOptions } from "./persistence-types";

export type MigrationDatabase = "clickhouse" | "postgres";

export interface MigrationFileEntry {
  readonly database: MigrationDatabase;
  readonly version: string;
  readonly filePath: string;
}

export interface MigrationManifest {
  readonly entries: readonly MigrationFileEntry[];
}

export interface MigrationValidationSuccess {
  readonly ok: true;
  readonly errors: readonly [];
  readonly checkedFiles: number;
}

export interface MigrationValidationFailure {
  readonly ok: false;
  readonly errors: readonly string[];
  readonly checkedFiles: number;
}

export type MigrationValidationResult = MigrationValidationSuccess | MigrationValidationFailure;

export interface SqlMigrationExecutor {
  execute(statement: string): Promise<void>;
  close(): Promise<void>;
}

export interface MigrationFileReader {
  read(filePath: string): string;
}

export interface MigrationDatabaseRunSummary {
  readonly database: MigrationDatabase;
  readonly executedFiles: number;
  readonly executedStatements: number;
}

export interface RunPlatformMigrationsOptions {
  readonly clickHouse: ClickHouseConnectionOptions;
  readonly postgres: PostgresConnectionOptions;
  readonly manifest?: MigrationManifest;
}

export interface PlatformMigrationsRunResult {
  readonly clickHouse: MigrationDatabaseRunSummary;
  readonly postgres: MigrationDatabaseRunSummary;
}

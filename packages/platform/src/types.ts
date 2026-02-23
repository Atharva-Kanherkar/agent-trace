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


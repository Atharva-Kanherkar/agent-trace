import { runPlatformMigrations } from "../../platform/src/migration-runner";
import type { PlatformMigrationsRunResult, RunPlatformMigrationsOptions } from "../../platform/src/types";
import type { RuntimeDatabaseConfig } from "./types";

export type RuntimeMigrationRunner = (
  options: RunPlatformMigrationsOptions
) => Promise<PlatformMigrationsRunResult>;

export async function runRuntimeDatabaseMigrations(
  config: RuntimeDatabaseConfig,
  runner: RuntimeMigrationRunner = runPlatformMigrations
): Promise<PlatformMigrationsRunResult> {
  return runner({
    clickHouse: config.clickHouse,
    postgres: config.postgres
  });
}

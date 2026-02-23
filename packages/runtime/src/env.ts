import type { RuntimeDatabaseConfig } from "./types";

type RuntimeEnv = Readonly<Record<string, string | undefined>>;

function readNonEmpty(env: RuntimeEnv, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return true;
  }
  if (value === "0" || value.toLowerCase() === "false") {
    return false;
  }
  return undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export function parseRuntimeDatabaseConfigFromEnv(env: RuntimeEnv): RuntimeDatabaseConfig | undefined {
  const clickHouseUrl = readNonEmpty(env, "CLICKHOUSE_URL");
  const postgresConnectionString = readNonEmpty(env, "POSTGRES_CONNECTION_STRING");

  if (clickHouseUrl === undefined || postgresConnectionString === undefined) {
    return undefined;
  }

  const clickHouseUsername = readNonEmpty(env, "CLICKHOUSE_USERNAME");
  const clickHousePassword = readNonEmpty(env, "CLICKHOUSE_PASSWORD");
  const clickHouseDatabase = readNonEmpty(env, "CLICKHOUSE_DATABASE");

  const clickHouse = {
    url: clickHouseUrl,
    ...(clickHouseUsername !== undefined ? { username: clickHouseUsername } : {}),
    ...(clickHousePassword !== undefined ? { password: clickHousePassword } : {}),
    ...(clickHouseDatabase !== undefined ? { database: clickHouseDatabase } : {})
  };

  const postgresSsl = parseBoolean(readNonEmpty(env, "POSTGRES_SSL"));
  const postgresMaxPoolSize = parsePositiveInteger(readNonEmpty(env, "POSTGRES_MAX_POOL_SIZE"));
  const postgres = {
    connectionString: postgresConnectionString,
    ...(postgresSsl !== undefined ? { ssl: postgresSsl } : {}),
    ...(postgresMaxPoolSize !== undefined ? { maxPoolSize: postgresMaxPoolSize } : {})
  };

  return {
    clickHouse,
    postgres
  };
}

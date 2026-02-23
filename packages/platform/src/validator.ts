import fs from "node:fs";

import type { MigrationManifest, MigrationValidationResult } from "./types";

function validateSqlContent(filePath: string, sql: string, errors: string[]): void {
  if (sql.trim().length === 0) {
    errors.push(`${filePath}: file is empty`);
    return;
  }

  const normalized = sql.toUpperCase();
  if (!normalized.includes("CREATE TABLE")) {
    errors.push(`${filePath}: expected at least one CREATE TABLE statement`);
  }
}

function validateVersionOrdering(manifest: MigrationManifest, errors: string[]): void {
  const byDb = new Map<string, string[]>();

  manifest.entries.forEach((entry) => {
    const versions = byDb.get(entry.database) ?? [];
    versions.push(entry.version);
    byDb.set(entry.database, versions);
  });

  byDb.forEach((versions, database) => {
    const sorted = [...versions].sort();
    const sameOrder = sorted.every((value, index) => value === versions[index]);
    if (!sameOrder) {
      errors.push(`${database}: migration versions are not in ascending order`);
    }
  });
}

export function validateMigrationManifest(manifest: MigrationManifest): MigrationValidationResult {
  const errors: string[] = [];

  manifest.entries.forEach((entry) => {
    if (!fs.existsSync(entry.filePath)) {
      errors.push(`${entry.filePath}: file does not exist`);
      return;
    }

    const content = fs.readFileSync(entry.filePath, "utf8");
    validateSqlContent(entry.filePath, content, errors);
  });

  validateVersionOrdering(manifest, errors);

  if (errors.length > 0) {
    return {
      ok: false,
      checkedFiles: manifest.entries.length,
      errors
    };
  }

  return {
    ok: true,
    checkedFiles: manifest.entries.length,
    errors: []
  };
}


import assert from "node:assert/strict";
import test from "node:test";

import { getMigrationManifest, validateMigrationManifest } from "../src";

test("migration manifest includes baseline clickhouse and postgres migrations", () => {
  const manifest = getMigrationManifest();
  assert.equal(manifest.entries.length, 7);

  const databases = new Set(manifest.entries.map((entry) => entry.database));
  assert.equal(databases.has("clickhouse"), true);
  assert.equal(databases.has("postgres"), true);
});

test("migration manifest validator succeeds for baseline files", () => {
  const manifest = getMigrationManifest();
  const result = validateMigrationManifest(manifest);
  assert.equal(result.ok, true);
  assert.equal(result.checkedFiles, 7);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runDatabaseMigrations, splitSqlStatements } from "../src/migration-runner";
import type { MigrationFileReader, SqlMigrationExecutor } from "../src/types";

class RecordingSqlMigrationExecutor implements SqlMigrationExecutor {
  public readonly statements: string[] = [];
  public closeCalled = false;

  public async execute(statement: string): Promise<void> {
    this.statements.push(statement);
  }

  public async close(): Promise<void> {
    this.closeCalled = true;
  }
}

class ThrowingSqlMigrationExecutor extends RecordingSqlMigrationExecutor {
  public constructor(private readonly failOn: string) {
    super();
  }

  public override async execute(statement: string): Promise<void> {
    await super.execute(statement);
    if (statement.includes(this.failOn)) {
      throw new Error("forced migration failure");
    }
  }
}

class FileSystemReader implements MigrationFileReader {
  public read(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }
}

function createTempSqlFile(fileName: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-platform-migration-test-"));
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("splitSqlStatements returns trimmed non-empty statements", () => {
  const statements = splitSqlStatements(`
    CREATE TABLE IF NOT EXISTS a (id UInt8);
    ;
    CREATE TABLE IF NOT EXISTS b (id UInt8);
  `);

  assert.deepEqual(statements, [
    "CREATE TABLE IF NOT EXISTS a (id UInt8)",
    "CREATE TABLE IF NOT EXISTS b (id UInt8)"
  ]);
});

test("runDatabaseMigrations executes all statements in version order and closes executor", async () => {
  const file1 = createTempSqlFile(
    "001.sql",
    `
      CREATE TABLE IF NOT EXISTS one (id UInt8);
      CREATE TABLE IF NOT EXISTS one_index (id UInt8);
    `
  );
  const file2 = createTempSqlFile(
    "002.sql",
    `
      CREATE TABLE IF NOT EXISTS two (id UInt8);
    `
  );

  const executor = new RecordingSqlMigrationExecutor();
  const summary = await runDatabaseMigrations({
    database: "clickhouse",
    entries: [
      {
        database: "clickhouse",
        version: "001",
        filePath: file1
      },
      {
        database: "clickhouse",
        version: "002",
        filePath: file2
      }
    ],
    executor,
    fileReader: new FileSystemReader()
  });

  assert.equal(summary.database, "clickhouse");
  assert.equal(summary.executedFiles, 2);
  assert.equal(summary.executedStatements, 3);
  assert.equal(executor.closeCalled, true);
  assert.equal(executor.statements.length, 3);

  fs.rmSync(path.dirname(file1), { recursive: true, force: true });
  fs.rmSync(path.dirname(file2), { recursive: true, force: true });
});

test("runDatabaseMigrations closes executor when statement execution fails", async () => {
  const file = createTempSqlFile(
    "001.sql",
    `
      CREATE TABLE IF NOT EXISTS one (id UInt8);
      CREATE TABLE IF NOT EXISTS fail_me (id UInt8);
    `
  );
  const executor = new ThrowingSqlMigrationExecutor("fail_me");

  await assert.rejects(
    async () => {
      await runDatabaseMigrations({
        database: "postgres",
        entries: [
          {
            database: "postgres",
            version: "001",
            filePath: file
          }
        ],
        executor,
        fileReader: new FileSystemReader()
      });
    },
    /forced migration failure/
  );

  assert.equal(executor.closeCalled, true);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

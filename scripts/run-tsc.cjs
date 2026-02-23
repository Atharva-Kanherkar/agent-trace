"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function findTscBinary() {
  const cwd = process.cwd();
  const explicit = process.env.TSC_PATH;
  const candidates = [
    explicit,
    path.join(cwd, "node_modules", "typescript", "bin", "tsc"),
    "/home/atharva/gemini-cli/node_modules/typescript/bin/tsc",
    "/home/atharva/.npm/_npx/1bf7c3c15bf47d04/node_modules/typescript/bin/tsc"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function main() {
  const tscBinary = findTscBinary();
  if (!tscBinary) {
    console.error("typescript compiler not found. Set TSC_PATH or install dependencies.");
    process.exit(1);
    return;
  }

  const args = process.argv.slice(2);
  const result = spawnSync(process.execPath, [tscBinary, ...args], {
    stdio: "inherit"
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
    return;
  }

  process.exit(result.status ?? 1);
}

main();


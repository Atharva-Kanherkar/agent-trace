"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function collectParentDirectories(startDir) {
  const directories = [];
  let current = path.resolve(startDir);
  while (true) {
    directories.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return directories;
}

function findTscBinary() {
  const cwd = process.cwd();
  const explicit = process.env.TSC_PATH;
  const parentDirectories = collectParentDirectories(cwd);
  const upwardCandidates = parentDirectories.map((directory) =>
    path.join(directory, "node_modules", "typescript", "bin", "tsc")
  );
  const candidates = [
    explicit,
    ...upwardCandidates,
    path.join(__dirname, "..", "node_modules", "typescript", "bin", "tsc"),
    "/home/atharva/gemini-cli/node_modules/typescript/bin/tsc",
    "/home/atharva/.npm/_npx/1bf7c3c15bf47d04/node_modules/typescript/bin/tsc"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const resolveBases = [...parentDirectories, __dirname, path.join(__dirname, "..")];
  for (const base of resolveBases) {
    try {
      return require.resolve("typescript/bin/tsc", { paths: [base] });
    } catch {
      // try next base path
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

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const runtimeDir = path.resolve(__dirname, "..");
const names = ["api", "collector", "schema"];

for (const name of names) {
  const linkPath = path.join(runtimeDir, name);
  if (!fs.existsSync(linkPath)) {
    continue;
  }

  const stat = fs.lstatSync(linkPath);
  if (!stat.isSymbolicLink()) {
    continue;
  }

  fs.rmSync(linkPath, { recursive: true, force: true });
}


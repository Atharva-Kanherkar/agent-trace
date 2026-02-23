"use strict";

const fs = require("node:fs");
const path = require("node:path");

const collectorDir = path.resolve(__dirname, "..");
const linkPath = path.join(collectorDir, "schema");

if (fs.existsSync(linkPath)) {
  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
}

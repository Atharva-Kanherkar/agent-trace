"use strict";

const fs = require("node:fs");
const path = require("node:path");

const collectorDir = path.resolve(__dirname, "..");
const links = [{ name: "schema", target: "../schema/dist" }];

for (const link of links) {
  const linkPath = path.join(collectorDir, link.name);
  try {
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath)) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors before re-linking
  }

  fs.symlinkSync(link.target, linkPath, "dir");
}

import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const outDir = "dist/standalone";

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: ["packages/runtime/src/standalone-entry.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: path.join(outDir, "agent-trace.cjs"),
  external: [
    "better-sqlite3"
  ],
  banner: {
    js: "#!/usr/bin/env node"
  },
  minify: false,
  sourcemap: false,
  logLevel: "info",
  define: {
    "process.env.BUNDLE_MODE": '"standalone"'
  }
});

fs.chmodSync(path.join(outDir, "agent-trace.cjs"), 0o755);

const pkg = {
  name: "agent-trace",
  version: "0.3.0",
  description: "Self-hosted observability for AI coding agents. One command, zero config.",
  license: "Apache-2.0",
  bin: {
    "agent-trace": "agent-trace.cjs"
  },
  dependencies: {
    "better-sqlite3": "^12.6.2"
  },
  engines: {
    node: ">=18"
  },
  repository: {
    type: "git",
    url: "https://github.com/Atharva-Kanherkar/agent-trace.git"
  },
  keywords: [
    "ai",
    "agent",
    "observability",
    "claude",
    "coding-agent",
    "telemetry",
    "dashboard"
  ],
  files: [
    "agent-trace.cjs"
  ]
};

fs.writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(pkg, null, 2) + "\n"
);

const bundleSize = fs.statSync(path.join(outDir, "agent-trace.cjs")).size;
const bundleSizeKb = (bundleSize / 1024).toFixed(0);

console.log(`\nbundle: ${outDir}/agent-trace.cjs (${bundleSizeKb} KB)`);
console.log(`package: ${outDir}/package.json`);
console.log(`\nto publish: cd ${outDir} && npm publish`);
console.log(`to test locally: node ${outDir}/agent-trace.cjs`);

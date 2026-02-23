import { getMigrationManifest, validateMigrationManifest } from "../src";

function main(): void {
  const manifest = getMigrationManifest();
  const result = validateMigrationManifest(manifest);

  if (!result.ok) {
    throw new Error(`platform migration smoke failed: ${result.errors.join(" | ")}`);
  }

  console.log("platform manual smoke passed");
  console.log(`checkedFiles=${result.checkedFiles}`);
}

main();


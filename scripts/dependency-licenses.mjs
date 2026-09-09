// Generate a portable metadata inventory; upstream license texts remain authoritative.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const groups = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
}));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const dependencies = Object.values(groups).flat().map((entry) => ({
  name: entry.name,
  versions: [...entry.versions].sort(compare),
  license: entry.license || "UNKNOWN",
  ...(entry.author ? { author: entry.author } : {}),
  ...(entry.homepage ? { homepage: entry.homepage } : {}),
})).sort((a, b) => compare(a.name, b.name));
const inventory = {
  schemaVersion: 1,
  packageManager: packageJson.packageManager,
  platform: `${process.platform}-${process.arch}`,
  scope: "All installed dependencies, including development and installed optional packages. Other platform binaries require separate review. Metadata is not a replacement for upstream license and NOTICE files.",
  dependencies,
};
writeFileSync(new URL("../docs/dependency-licenses.json", import.meta.url), `${JSON.stringify(inventory, null, 2)}\n`);
const unknown = dependencies.filter((entry) => /UNKNOWN|UNLICENSED|SEE LICENSE/i.test(entry.license));
console.log(`Recorded ${dependencies.length} package entries (${inventory.platform}); ${unknown.length} need license metadata review.`);
if (unknown.length) {
  console.error(unknown.map((entry) => `${entry.name}: ${entry.license}`).join("\n"));
  process.exitCode = 1;
}

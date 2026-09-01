import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(packageDirectory, "entry.mjs");
const packageVersionPattern = /var \{ version(?:: (\w+))? \} = createRequire\(import\.meta\.url\)\("\.\.\/package\.json"\);/g;

await build({
  entryPoints: [resolve(packageDirectory, "src", "index.ts")],
  bundle: true,
  format: "esm",
  outfile: outputPath,
  platform: "node",
  target: "node22",
});

const bundledEntry = await readFile(outputPath, "utf8");
const matches = [...bundledEntry.matchAll(packageVersionPattern)];
if (matches.length !== 1) {
  throw new Error(`Expected one DeepSeek Harness package-version lookup, found ${matches.length}`);
}
const variableName = matches[0][1] ?? "version";
await writeFile(
  outputPath,
  bundledEntry.replace(packageVersionPattern, `var ${variableName} = "0.1.1-rc.2";`),
);

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, "..");
const outputPath = resolve(desktopDirectory, "dist", "resources", "dsh-runtime.mjs");
const dshVersionLookup = 'var { version } = createRequire(import.meta.url)("../package.json");';
const bundledDshVersion = 'var version = "0.1.1-rc.2";';

await build({
  entryPoints: [resolve(desktopDirectory, "..", "..", "packages", "dsh-yishan", "src", "bin.ts")],
  banner: { js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);' },
  bundle: true,
  format: "esm",
  outfile: outputPath,
  platform: "node",
  target: "node24",
});

const bundledRuntime = await readFile(outputPath, "utf8");
if (!bundledRuntime.includes(dshVersionLookup)) {
  throw new Error("Unable to inline the DeepSeek Harness package version in the DSH runtime bundle.");
}
await writeFile(outputPath, bundledRuntime.replace(dshVersionLookup, bundledDshVersion));

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, "..");
const outputPath = resolve(desktopDirectory, ".dsh-smoke", "dsh-runtime-smoke.mjs");

await mkdir(dirname(outputPath), { recursive: true });
await build({
  entryPoints: [resolve(desktopDirectory, "..", "..", "packages", "dsh-yishan", "src", "runtimeSmokeEntry.ts")],
  banner: { js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);' },
  bundle: true,
  format: "esm",
  outfile: outputPath,
  platform: "node",
  target: "node24",
});

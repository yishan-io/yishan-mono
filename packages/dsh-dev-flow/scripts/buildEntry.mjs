import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [resolve(packageDirectory, "src", "index.ts")],
  bundle: true,
  format: "esm",
  outfile: resolve(packageDirectory, "entry.mjs"),
  platform: "node",
  target: "node22",
});

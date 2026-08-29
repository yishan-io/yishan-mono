import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, "..");
const resourcesDirectory = resolve(desktopDirectory, "dist", "resources");
const outputPath = resolve(resourcesDirectory, "dsh-runtime.mjs");
const dshVersionLookup = 'var { version } = createRequire(import.meta.url)("../package.json");';
const bundledDshVersion = 'var version = "0.1.1-rc.2";';
const dshPackageRequire = createRequire(resolve(desktopDirectory, "..", "..", "packages", "dsh-yishan", "package.json"));
const subprocessPackagePath = dshPackageRequire.resolve("@deepseek-ai/dsh-subprocess-local/package.json");
const subprocessPackageDirectory = dirname(subprocessPackagePath);
const koffiNativePackageName = `@koromix/koffi-${process.platform}-${process.arch}`;

function resolveNativeRuntimePackage(packageName) {
  let packageDirectory = dirname(dshPackageRequire.resolve(packageName, { paths: [subprocessPackageDirectory] }));
  while (!existsSync(resolve(packageDirectory, "package.json"))) {
    const parentDirectory = dirname(packageDirectory);
    if (parentDirectory === packageDirectory) throw new Error(`Unable to find package root for ${packageName}.`);
    packageDirectory = parentDirectory;
  }
  return packageDirectory;
}

async function copyNativeRuntimePackage(packageName) {
  const destination = resolve(resourcesDirectory, "node_modules", packageName);
  await cp(resolveNativeRuntimePackage(packageName), destination, { recursive: true });
}

await rm(resolve(resourcesDirectory, "node_modules"), { recursive: true, force: true });
await mkdir(resourcesDirectory, { recursive: true });

await build({
  entryPoints: [resolve(desktopDirectory, "..", "..", "packages", "dsh-yishan", "src", "runtime", "bin.ts")],
  banner: { js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);' },
  bundle: true,
  external: ["koffi", "node-pty"],
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
await copyNativeRuntimePackage("koffi");
await copyNativeRuntimePackage(koffiNativePackageName);
await copyNativeRuntimePackage("node-pty");

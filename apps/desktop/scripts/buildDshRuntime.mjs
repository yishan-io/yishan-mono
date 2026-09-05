import { execFileSync } from "node:child_process";
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
const devFlowSeedBuilder = resolve(desktopDirectory, "..", "..", "packages", "dsh-dev-flow", "scripts", "buildSeed.mjs");
const dshPluginsDirectory = resolve(resourcesDirectory, "dsh-plugins");
const dshPackageVersionPattern = /(?:var|const)\s+\{\s*version(?:\s*:\s*([\w$]+))?\s*\}\s*=\s*createRequire\d*\(import\.meta\.url\)\(\s*["\']\.\.\/package\.json["\']\s*\)\s*;/g;
const dshVersion = "0.1.1-rc.2";
const landlockSupportedArchitectures = new Set(["x64", "arm64"]);
const dshRuntimePackageRequire = createRequire(resolve(desktopDirectory, "..", "..", "packages", "dsh-runtime", "package.json"));
const subprocessPackagePath = dshRuntimePackageRequire.resolve("@deepseek-ai/dsh-subprocess-local/package.json");
const subprocessPackageDirectory = dirname(subprocessPackagePath);

/** Replaces every bundled DSH package-version lookup with the packaged runtime version. */
export function inlineDshPackageVersions(bundledRuntime) {
  const runtimeWithInlinedVersions = bundledRuntime.replaceAll(
    dshPackageVersionPattern,
    (_match, versionBinding) => `var ${versionBinding ?? "version"} = "${dshVersion}";`,
  );
  if (runtimeWithInlinedVersions === bundledRuntime) {
    throw new Error("Unable to inline the DeepSeek Harness package version in the DSH runtime bundle.");
  }
  return runtimeWithInlinedVersions;
}

/** Returns the Koffi native package required by a runtime target. */
export function getKoffiNativePackageName(platform, architecture) {
  return `@koromix/koffi-${platform}-${architecture}`;
}

/** Returns the native packages that must accompany one DSH runtime target. */
export function getNativeRuntimePackageNames(platform, architecture) {
  const packageNames = ["koffi", getKoffiNativePackageName(platform, architecture), "node-pty"];
  const landlockNativePackageName = getLandlockNativePackageName(platform, architecture);
  if (landlockNativePackageName !== undefined) packageNames.push(landlockNativePackageName);
  return packageNames;
}

/** Returns the Landlock launcher package required by a Linux runtime target. */
export function getLandlockNativePackageName(platform, architecture) {
  if (platform !== "linux" || !landlockSupportedArchitectures.has(architecture)) return undefined;
  return `@deepseek-ai/node-addon-landlock-run-${platform}-${architecture}`;
}

function resolveNativeRuntimePackage(packageName) {
  let packageDirectory = dirname(dshRuntimePackageRequire.resolve(packageName, { paths: [subprocessPackageDirectory] }));
  while (!existsSync(resolve(packageDirectory, "package.json"))) {
    const parentDirectory = dirname(packageDirectory);
    if (parentDirectory === packageDirectory) throw new Error(`Unable to find package root for ${packageName}.`);
    packageDirectory = parentDirectory;
  }
  return packageDirectory;
}

/** Copies one native runtime package into the packaged resources directory. */
export async function copyNativeRuntimePackage(
  packageName,
  packageDirectoryResolver = resolveNativeRuntimePackage,
  outputResourcesDirectory = resourcesDirectory,
) {
  const destination = resolve(outputResourcesDirectory, "node_modules", packageName);
  await cp(packageDirectoryResolver(packageName), destination, { recursive: true });
}

/** Copies all native runtime packages required by an Electron platform and architecture target. */
export async function copyNativeRuntimePackages(
  platform,
  architecture,
  packageDirectoryResolver = resolveNativeRuntimePackage,
  outputResourcesDirectory = resourcesDirectory,
) {
  for (const packageName of getNativeRuntimePackageNames(platform, architecture)) {
    try {
      await copyNativeRuntimePackage(packageName, packageDirectoryResolver, outputResourcesDirectory);
    } catch (error) {
      throw new Error(
        `Unable to find ${packageName}, required for the ${platform}/${architecture} runtime target. ` +
          `Install that target's optional dependencies (for example: bun install --os ${platform} --cpu ${architecture}) ` +
          "before packaging.",
        { cause: error },
      );
    }
  }
}

/** Builds the DSH runtime assets for an Electron platform and architecture target. */
export async function buildDshRuntime({ platform = process.platform, architecture = process.arch } = {}) {
  await rm(resolve(resourcesDirectory, "node_modules"), { recursive: true, force: true });
  await rm(resolve(resourcesDirectory, "dsh-skills"), { recursive: true, force: true });
  await rm(dshPluginsDirectory, { recursive: true, force: true });
  await mkdir(resourcesDirectory, { recursive: true });
  execFileSync(process.execPath, [devFlowSeedBuilder, dshPluginsDirectory], { stdio: "inherit" });

  await build({
    entryPoints: [resolve(desktopDirectory, "..", "..", "packages", "dsh-runtime", "src", "index.ts")],
    banner: { js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);' },
    bundle: true,
    external: ["koffi", "node-pty"],
    format: "esm",
    outfile: outputPath,
    platform: "node",
    target: "node24",
  });

  const bundledRuntime = await readFile(outputPath, "utf8");
  await writeFile(outputPath, inlineDshPackageVersions(bundledRuntime));
  await copyNativeRuntimePackages(platform, architecture);
}

function getBuildTargetFromArguments(args) {
  const target = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--platform") target.platform = args[index + 1];
    if (args[index] === "--arch") target.architecture = args[index + 1];
  }
  return target;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildDshRuntime(getBuildTargetFromArguments(process.argv.slice(2)));

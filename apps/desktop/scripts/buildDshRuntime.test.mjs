import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  copyNativeRuntimePackages,
  inlineDshPackageVersions,
  getLandlockNativePackageName,
  getNativeRuntimePackageNames,
} from "./buildDshRuntime.mjs";

const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "yishan-dsh-runtime-package-"));

async function createPackageFixture(packageName) {
  const fixtureDirectory = resolve(temporaryDirectory, "fixtures", packageName);
  await mkdir(resolve(fixtureDirectory, "bin"), { recursive: true });
  await writeFile(resolve(fixtureDirectory, "package.json"), JSON.stringify({ name: packageName }));
  await writeFile(resolve(fixtureDirectory, "bin", "native-runtime"), packageName);
  return fixtureDirectory;
}

try {
  const runtimeWithRenamedPackageRequires = [
    'var { version } = createRequire(import.meta.url)("../package.json");',
    'var { version: version3 } = createRequire4(import.meta.url)("../package.json");',
    "var { version: version15 } = createRequire15(import.meta.url)('../package.json');",
  ].join("\n");
  const rewrittenRuntime = inlineDshPackageVersions(runtimeWithRenamedPackageRequires);
  assert.equal(rewrittenRuntime, ['var version = "0.1.1-rc.2";', 'var version3 = "0.1.1-rc.2";', 'var version15 = "0.1.1-rc.2";'].join("\n"));

  assert.equal(getLandlockNativePackageName("linux", "x64"), "@deepseek-ai/node-addon-landlock-run-linux-x64");
  assert.equal(getLandlockNativePackageName("linux", "arm64"), "@deepseek-ai/node-addon-landlock-run-linux-arm64");
  assert.equal(getLandlockNativePackageName("linux", "ia32"), undefined);
  assert.equal(getLandlockNativePackageName("linux", "armv7l"), undefined);
  assert.deepEqual(getNativeRuntimePackageNames("linux", "ia32"), ["koffi", "@koromix/koffi-linux-ia32", "node-pty"]);
  assert.deepEqual(getNativeRuntimePackageNames("linux", "armv7l"), ["koffi", "@koromix/koffi-linux-armv7l", "node-pty"]);
  assert.equal(getLandlockNativePackageName("darwin", "arm64"), undefined);
  assert.deepEqual(getNativeRuntimePackageNames("darwin", "x64"), ["koffi", "@koromix/koffi-darwin-x64", "node-pty"]);
  assert.deepEqual(getNativeRuntimePackageNames("darwin", "arm64"), ["koffi", "@koromix/koffi-darwin-arm64", "node-pty"]);

  const packageFixtures = new Map();
  for (const packageName of [
    ...getNativeRuntimePackageNames("linux", "x64"),
    ...getNativeRuntimePackageNames("linux", "arm64"),
    ...getNativeRuntimePackageNames("darwin", "x64"),
    ...getNativeRuntimePackageNames("darwin", "arm64"),
  ]) {
    if (!packageFixtures.has(packageName)) packageFixtures.set(packageName, await createPackageFixture(packageName));
  }
  const resolvePackageFixture = (packageName) => packageFixtures.get(packageName);

  for (const target of [
    { platform: "linux", architecture: "x64" },
    { platform: "linux", architecture: "arm64" },
    { platform: "darwin", architecture: "x64" },
    { platform: "darwin", architecture: "arm64" },
  ]) {
    const resourcesDirectory = resolve(temporaryDirectory, `${target.platform}-${target.architecture}`);
    const expectedPackageNames = getNativeRuntimePackageNames(target.platform, target.architecture);
    await copyNativeRuntimePackages(target.platform, target.architecture, resolvePackageFixture, resourcesDirectory);

    for (const packageName of expectedPackageNames) {
      const copiedFile = resolve(resourcesDirectory, "node_modules", packageName, "bin", "native-runtime");
      assert.equal(await readFile(copiedFile, "utf8"), packageName);
    }
    const unexpectedLandlockPackage = getLandlockNativePackageName("linux", "x64");
    assert.equal(
      existsSync(resolve(resourcesDirectory, "node_modules", unexpectedLandlockPackage)),
      target.platform === "linux" && target.architecture === "x64",
    );
  }

  const missingLandlockPackage = getLandlockNativePackageName("linux", "arm64");
  await assert.rejects(
    () =>
      copyNativeRuntimePackages(
        "linux",
        "arm64",
        (packageName) => (packageName === missingLandlockPackage ? undefined : packageFixtures.get(packageName)),
        resolve(temporaryDirectory, "missing-package"),
      ),
    /node-addon-landlock-run-linux-arm64.*linux\/arm64.*bun install --os linux --cpu arm64/s,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

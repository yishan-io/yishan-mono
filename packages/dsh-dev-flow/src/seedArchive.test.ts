import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seedBuilder = resolve(packageDirectory, "scripts", "buildSeed.mjs");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("managed plugin seed", () => {
  it("builds a reproducible archive and integrity record", async () => {
    const first = await createSeedDirectory();
    const second = await createSeedDirectory();

    await buildSeed(first);
    await buildSeed(second);

    await expect(readFile(resolve(first, "dsh-dev-flow.tgz"))).resolves.toEqual(
      await readFile(resolve(second, "dsh-dev-flow.tgz")),
    );
    await expect(readFile(resolve(first, "dsh-dev-flow.integrity"), "utf8")).resolves.toEqual(
      await readFile(resolve(second, "dsh-dev-flow.integrity"), "utf8"),
    );
  });
});

async function createSeedDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "dsh-dev-flow-seed-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function buildSeed(outputDirectory: string): Promise<void> {
  await execFileAsync(process.execPath, [seedBuilder, outputDirectory], { cwd: packageDirectory });
}

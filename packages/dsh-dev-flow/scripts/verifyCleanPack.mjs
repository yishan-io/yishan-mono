import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = await mkdtemp(resolve(tmpdir(), "dsh-dev-flow-pack-"));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  await rm(resolve(packageDirectory, "entry.mjs"), { force: true });
  const result = JSON.parse(
    execFileSync(npmExecutable, ["pack", "--json", "--pack-destination", outputDirectory], {
      cwd: packageDirectory,
      encoding: "utf8",
    }),
  );
  const files = result[0]?.files;
  if (!Array.isArray(files) || !files.some(({ path }) => path === "entry.mjs")) {
    throw new Error("clean npm pack omitted the compiled managed plugin entrypoint");
  }
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}

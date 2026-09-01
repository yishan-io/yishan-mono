import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(process.argv[2] ?? resolve(packageDirectory, "dist"));
const archivePath = resolve(outputDirectory, "dsh-dev-flow.tgz");
const integrityPath = resolve(outputDirectory, "dsh-dev-flow.integrity");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

await mkdir(outputDirectory, { recursive: true });
await Promise.all([rm(archivePath, { force: true }), rm(integrityPath, { force: true })]);
execFileSync("bun", ["run", "build"], { cwd: packageDirectory, stdio: "inherit" });
const result = JSON.parse(
  execFileSync(npmExecutable, ["pack", "--ignore-scripts", "--json", "--pack-destination", outputDirectory], {
    cwd: packageDirectory,
    encoding: "utf8",
  }),
);
if (!Array.isArray(result) || result.length !== 1 || typeof result[0]?.filename !== "string") {
  throw new Error("npm pack did not return one DSH dev-flow archive");
}
const generatedPath = resolve(outputDirectory, result[0].filename);
if (generatedPath !== archivePath) await rename(generatedPath, archivePath);
const archive = await readFile(archivePath);
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
await writeFile(integrityPath, `${integrity}\n`, { mode: 0o644 });
process.stdout.write(`${integrity}\n`);

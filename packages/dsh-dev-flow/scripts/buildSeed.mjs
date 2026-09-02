import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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
const npmArchive = await readFile(archivePath);
const archive = deterministicGzip(gunzipSync(npmArchive));
await writeFile(archivePath, archive, { mode: 0o644 });
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
await writeFile(integrityPath, `${integrity}\n`, { mode: 0o644 });
process.stdout.write(`${integrity}\n`);

function deterministicGzip(input) {
  const blocks = [];
  for (let offset = 0; offset < input.length; offset += 0xffff) {
    const chunk = input.subarray(offset, Math.min(offset + 0xffff, input.length));
    const header = Buffer.alloc(5);
    header[0] = offset + chunk.length === input.length ? 1 : 0;
    header.writeUInt16LE(chunk.length, 1);
    header.writeUInt16LE(~chunk.length & 0xffff, 3);
    blocks.push(header, chunk);
  }
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(crc32(input), 0);
  trailer.writeUInt32LE(input.length >>> 0, 4);
  return Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0xff]), ...blocks, trailer]);
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

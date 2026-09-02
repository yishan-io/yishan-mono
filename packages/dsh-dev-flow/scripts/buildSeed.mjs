import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";


const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(process.argv[2] ?? resolve(packageDirectory, "dist"));
const archivePath = resolve(outputDirectory, "dsh-dev-flow.tgz");
const integrityPath = resolve(outputDirectory, "dsh-dev-flow.integrity");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([rm(archivePath, { force: true }), rm(integrityPath, { force: true })]);
execFileSync("bun", ["run", "build"], { cwd: packageDirectory, stdio: "inherit" });
const packageFiles = await collectPackageFiles();
const archive = deterministicGzip(createTarArchive(packageFiles));
await writeFile(archivePath, archive, { mode: 0o644 });
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
await writeFile(integrityPath, `${integrity}\n`, { mode: 0o644 });
process.stdout.write(`${integrity}\n`);

async function collectPackageFiles() {
  const files = ["LICENSE", "README.md", "entry.mjs", "package.json"];
  const skillDirectory = resolve(packageDirectory, "skills");
  const skillDirectoryInfo = await lstat(skillDirectory);
  if (!skillDirectoryInfo.isDirectory() || skillDirectoryInfo.isSymbolicLink()) {
    throw new Error("Invalid DSH dev-flow skills directory");
  }
  const pending = [skillDirectory];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        const info = await lstat(path);
        if (!info.isDirectory() || info.isSymbolicLink()) {
          throw new Error(`Invalid DSH dev-flow skills directory: ${path}`);
        }
        pending.push(path);
      } else if (entry.isFile()) files.push(relative(packageDirectory, path).split(sep).join("/"));
      else throw new Error(`Unsupported DSH dev-flow package entry: ${path}`);
    }
  }
  files.sort();
  return Promise.all(
    files.map(async (path) => {
      const sourcePath = resolve(packageDirectory, path);
      const info = await lstat(sourcePath);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Invalid DSH dev-flow package file: ${path}`);
      return { path: `package/${path}`, content: await readFile(sourcePath) };
    }),
  );
}

function createTarArchive(files) {
  const blocks = [];
  for (const file of files) {
    const header = Buffer.alloc(512);
    writeTarString(header, file.path, 0, 100);
    writeTarOctal(header, 0o644, 100, 8);
    writeTarOctal(header, 0, 108, 8);
    writeTarOctal(header, 0, 116, 8);
    writeTarOctal(header, file.content.length, 124, 12);
    writeTarOctal(header, 0, 136, 12);
    header.fill(0x20, 148, 156);
    header[156] = "0".charCodeAt(0);
    writeTarString(header, "ustar", 257, 6);
    writeTarString(header, "00", 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    blocks.push(header, file.content);
    const padding = (512 - (file.content.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function writeTarString(header, value, offset, length) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > length) throw new Error(`DSH dev-flow archive path is too long: ${value}`);
  encoded.copy(header, offset);
}

function writeTarOctal(header, value, offset, length) {
  const encoded = `${value.toString(8).padStart(length - 1, "0")}\0`;
  header.write(encoded, offset, length, "ascii");
}

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

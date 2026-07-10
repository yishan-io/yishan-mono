import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const bunStoreRoot = path.join(repoRoot, "node_modules", ".bun");
const targetSuffix = path.join(
  "node_modules",
  "@expo",
  "cli",
  "build",
  "src",
  "run",
  "ios",
  "appleDevice",
  "client",
  "LockdowndClient.js",
);
const buggySnippet = "debug(`startSession: ${pairRecord}`);";
const patchedSnippet = "debug('startSession: %O', pairRecord);";
const compatibleSnippets = [
  "debug('startSession');",
  'debug("startSession");',
  "debug(`startSession`);",
];

async function listExpoCliLockdownClients() {
  let entries;
  try {
    entries = await readdir(bunStoreRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@expo+cli@"))
    .map((entry) => path.join(bunStoreRoot, entry.name, targetSuffix));
}

async function patchFile(filePath) {
  const source = await readFile(filePath, "utf8");
  if (source.includes(patchedSnippet)) {
    return false;
  }
  if (source.includes(buggySnippet)) {
    const nextSource = source.replace(buggySnippet, patchedSnippet);
    await writeFile(filePath, nextSource, "utf8");
    return true;
  }

  if (compatibleSnippets.some((snippet) => source.includes(snippet))) {
    return false;
  }

  console.warn(`[patchExpoCliAppleDevice] Skipping unrecognized Expo CLI file: ${filePath}`);
  return false;
}

const targetFiles = await listExpoCliLockdownClients();
if (targetFiles.length === 0) {
  console.warn("[patchExpoCliAppleDevice] No Expo CLI LockdowndClient.js files found under node_modules/.bun");
  process.exit(0);
}

let patchedCount = 0;
for (const targetFile of targetFiles) {
  if (await patchFile(targetFile)) {
    patchedCount += 1;
  }
}

if (patchedCount > 0) {
  console.log(`[patchExpoCliAppleDevice] Patched ${patchedCount} Expo CLI file(s)`);
}

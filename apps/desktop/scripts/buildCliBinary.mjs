import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const cliDir = resolve(desktopDir, "..", "cli-rs");
const cliBinDir = resolve(cliDir, "bin");
const resourcesDir = resolve(desktopDir, "dist", "resources");
const binaryName = process.platform === "win32" ? "yishan.exe" : "yishan";
const cliBinaryCandidates = [resolve(cliBinDir, binaryName), resolve(cliBinDir, "yishan"), resolve(cliBinDir, "yishan.exe")];
const outputPath = resolve(resourcesDir, binaryName);
const cargoTomlPath = resolve(cliDir, "Cargo.toml");
const cliVersion =
  process.env.YISHAN_CLI_VERSION?.trim() ||
  (existsSync(cargoTomlPath)
    ? (() => {
        const match = readFileSync(cargoTomlPath, "utf8").match(/^version\s*=\s*"([^"]+)"/m);
        return match ? match[1] : "";
      })()
    : "") ||
  "dev";

mkdirSync(resourcesDir, { recursive: true });

const buildResult = spawnSync("make", ["build-release", `VERSION=${cliVersion}`], {
  cwd: cliDir,
  stdio: "inherit",
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const sourcePath = cliBinaryCandidates.find((candidatePath) => existsSync(candidatePath));
if (!sourcePath) {
  console.error("Failed to locate CLI binary in apps/cli-rs/bin after make build-release");
  process.exit(1);
}

copyFileSync(sourcePath, outputPath);

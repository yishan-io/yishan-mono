import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SUPPORTED_DESKTOP_BUILD_PLATFORMS = new Set(["darwin", "linux"]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const cliDir = resolve(desktopDir, "..", "cli");
const cliBinDir = resolve(cliDir, "bin");
const resourcesDir = resolve(desktopDir, "dist", "resources");
const binaryName = "yishan";
const cliBinaryCandidates = [resolve(cliBinDir, binaryName)];
const outputPath = resolve(resourcesDir, binaryName);
const packageJson = JSON.parse(readFileSync(resolve(desktopDir, "package.json"), "utf8"));
const cliVersion =
  process.env.YISHAN_CLI_VERSION?.trim() ||
  process.env.YISHAN_APP_VERSION?.trim() ||
  (typeof packageJson.version === "string" ? packageJson.version.trim() : "") ||
  "0.0.0";

// Computer Use runtime packaging/signing follow-up notes:
// docs/computer-use-macos-packaging.md

if (!SUPPORTED_DESKTOP_BUILD_PLATFORMS.has(process.platform)) {
  console.error(`Desktop packaging is only supported on macOS and Linux. Received: ${process.platform}`);
  process.exit(1);
}

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
  console.error("Failed to locate CLI binary in apps/cli/bin after make build-release");
  process.exit(1);
}

copyFileSync(sourcePath, outputPath);

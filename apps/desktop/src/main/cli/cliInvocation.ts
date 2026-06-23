import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { isDevMode } from "../runtime/environment";

/** Resolved executable and prefix args for launching the local CLI. */
export type CliInvocation = {
  executablePath: string;
  prefixArgs: string[];
  cwd?: string;
};

type ResolveCliInvocationOptions = {
  includeDevApiBaseUrl?: boolean;
};

function resolveExecutableOnPath(binaryName: string): string | undefined {
  const paths = (process.env.PATH || "").split(delimiter);

  for (const dir of paths) {
    if (!dir.trim()) {
      continue;
    }

    const candidate = resolve(dir, binaryName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveDevCliDir(): string | undefined {
  const candidates = [
    process.env.YISHAN_CLI_DEV_DIR?.trim(),
    resolve(process.cwd(), "..", "cli"),
    resolve(process.cwd(), "apps", "cli"),
    resolve(process.cwd(), "..", "apps", "cli"),
    resolve(process.cwd(), "..", "..", "apps", "cli"),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveUserInstalledCli(): string | undefined {
  const binaryName = process.platform === "win32" ? "yishan.exe" : "yishan";
  const bundledDir = process.resourcesPath;
  const pathBinary = resolveExecutableOnPath(binaryName);

  if (pathBinary && !pathBinary.startsWith(bundledDir)) {
    return pathBinary;
  }

  const home = process.env.HOME || process.env.USERPROFILE || "";
  const commonPaths =
    process.platform === "win32"
      ? [resolve(home, "AppData", "Local", "Yishan", "bin", binaryName), resolve(home, ".local", "bin", binaryName)]
      : [resolve(home, ".local", "bin", binaryName), `/usr/local/bin/${binaryName}`, `/opt/homebrew/bin/${binaryName}`];

  for (const candidate of commonPaths) {
    if (!candidate.startsWith(bundledDir) && existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveGoExecutablePath(): string {
  const explicitGoPath = process.env.YISHAN_GO_PATH?.trim();
  if (explicitGoPath) {
    return explicitGoPath;
  }

  const binaryName = process.platform === "win32" ? "go.exe" : "go";
  const pathBinary = resolveExecutableOnPath(binaryName);
  if (pathBinary) {
    return pathBinary;
  }

  const home = process.env.HOME || process.env.USERPROFILE || "";
  const commonPaths =
    process.platform === "win32"
      ? []
      : [
          "/opt/homebrew/bin/go",
          "/usr/local/bin/go",
          resolve(home, "go", "bin", "go"),
          resolve(home, ".asdf", "shims", "go"),
          resolve(home, ".mise", "shims", "go"),
          resolve(home, ".local", "bin", "go"),
        ];

  for (const candidate of commonPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Go toolchain not found for desktop dev mode. Install Go or set YISHAN_GO_PATH.");
}

function buildDevCliPrefixArgs(options?: ResolveCliInvocationOptions): string[] {
  if (!options?.includeDevApiBaseUrl) {
    return ["run", "."];
  }

  if (!isDevMode()) {
    return ["run", ".", "--profile", "dev"];
  }

  const devApiBaseUrl = process.env.VITE_API_BASE_URL?.trim() || "http://localhost:8787";
  return ["run", ".", "--profile", "dev", "--api-base-url", devApiBaseUrl];
}

/** Resolves the correct CLI launch strategy for bundled, installed, and dev-mode desktop flows. */
export function resolveCliInvocation(options?: ResolveCliInvocationOptions): CliInvocation {
  const explicitCliPath = process.env.YISHAN_CLI_PATH?.trim();
  if (explicitCliPath) {
    return {
      executablePath: explicitCliPath,
      prefixArgs: [],
    };
  }

  if (isDevMode()) {
    return {
      executablePath: resolveGoExecutablePath(),
      prefixArgs: buildDevCliPrefixArgs(options),
      cwd: resolveDevCliDir(),
    };
  }

  const userInstalledCli = resolveUserInstalledCli();
  if (userInstalledCli) {
    return {
      executablePath: userInstalledCli,
      prefixArgs: [],
    };
  }

  const bundledCliName = process.platform === "win32" ? "yishan.exe" : "yishan";
  const bundledCliPath = resolve(process.resourcesPath, bundledCliName);
  if (!existsSync(bundledCliPath)) {
    return {
      executablePath: resolveGoExecutablePath(),
      prefixArgs: buildDevCliPrefixArgs(options),
      cwd: resolveDevCliDir(),
    };
  }

  return {
    executablePath: bundledCliPath,
    prefixArgs: [],
  };
}

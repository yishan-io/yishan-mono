import { access, lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { dirname, delimiter, resolve } from "node:path";
import { homedir } from "node:os";

export type DesktopCliInstallStatus = {
  isAvailableInPath: boolean;
  resolvedPath?: string;
  isManagedInstall: boolean;
  installPath: string;
  bundledCliPath: string;
};

function getBundledCliPath(): string {
  const binaryName = process.platform === "win32" ? "yishan.exe" : "yishan";
  return resolve(process.resourcesPath, binaryName);
}

function getInstallPath(): string {
  if (process.platform === "win32") {
    return resolve(homedir(), "AppData", "Local", "Yishan", "bin", "yishan.exe");
  }

  return resolve(homedir(), ".local", "bin", "yishan");
}

function resolvePathCommandTarget(): string | undefined {
  const paths = (process.env.PATH || "").split(delimiter).map((item) => item.trim());
  for (const pathEntry of paths) {
    if (!pathEntry) {
      continue;
    }
    const target = resolve(pathEntry, process.platform === "win32" ? "yishan.exe" : "yishan");
    if (existsSync(target)) {
      return target;
    }
  }
  return undefined;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function getDesktopCliInstallStatus(): Promise<DesktopCliInstallStatus> {
  const bundledCliPath = getBundledCliPath();
  const installPath = getInstallPath();
  const resolvedPath = resolvePathCommandTarget();
  let isManagedInstall = false;

  if (process.platform !== "win32") {
    try {
      const stats = await lstat(installPath);
      if (stats.isSymbolicLink()) {
        const linkedTarget = await readlink(installPath);
        isManagedInstall = resolve(dirname(installPath), linkedTarget) === bundledCliPath;
      }
    } catch {
      isManagedInstall = false;
    }
  } else {
    isManagedInstall = existsSync(installPath);
  }

  const installPathExecutable = await isExecutable(installPath);
  const isAvailableInPath = (resolvedPath ? await isExecutable(resolvedPath) : false) || installPathExecutable;
  const effectiveResolvedPath = resolvedPath ?? (installPathExecutable ? installPath : undefined);

  return {
    isAvailableInPath,
    resolvedPath: effectiveResolvedPath,
    isManagedInstall,
    installPath,
    bundledCliPath,
  };
}

export async function installDesktopCli(): Promise<DesktopCliInstallStatus> {
  const bundledCliPath = getBundledCliPath();
  if (!existsSync(bundledCliPath)) {
    throw new Error("Bundled CLI binary is not available.");
  }

  const installPath = getInstallPath();
  await mkdir(dirname(installPath), { recursive: true });

  if (process.platform === "win32") {
    throw new Error("Desktop-assisted CLI install is not supported on Windows yet.");
  }

  try {
    await unlink(installPath);
  } catch {}

  await symlink(bundledCliPath, installPath);
  return await getDesktopCliInstallStatus();
}

export async function uninstallDesktopCli(): Promise<DesktopCliInstallStatus> {
  const installPath = getInstallPath();
  if (process.platform === "win32") {
    throw new Error("Desktop-assisted CLI uninstall is not supported on Windows yet.");
  }

  try {
    await unlink(installPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return await getDesktopCliInstallStatus();
}

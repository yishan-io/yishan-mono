/**
 * electron-builder beforePack hook.
 *
 * On macOS CI builds both arm64 and x64 Desktop arches are built from a
 * single runner. The CI download step places arch-suffixed CLI binaries
 * (yishan-arm64, yishan-amd64) next to the canonical yishan binary in
 * dist/resources/. This hook copies the correct one to "yishan" before
 * each arch is packed, so every .dmg / .zip ships the matching native CLI.
 *
 * On Linux (or when arch-suffixed binaries are absent) this is a no-op.
 */

import { existsSync, copyFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

/** @param {import("electron-builder").BeforePackContext} context */
export default async function beforePack(context) {
  const { arch, appOutDir } = context;

  // electron-builder Arch enum: 0=ia32, 1=x64, 2=armv7l, 3=arm64, 4=universal
  const archMap = { 0: "ia32", 1: "amd64", 2: "armv7l", 3: "arm64", 4: "universal" };
  const goArch = archMap[arch];

  if (!goArch) return;

  const resourcesDir = resolve(context.packager.projectDir, "dist/resources");
  const suffixedBin = resolve(resourcesDir, `yishan-${goArch}`);
  const targetBin = resolve(resourcesDir, "yishan");

  if (existsSync(suffixedBin)) {
    console.log(`[beforePack] copying CLI binary for ${goArch} → dist/resources/yishan`);
    copyFileSync(suffixedBin, targetBin);
    chmodSync(targetBin, 0o755);
  }
}

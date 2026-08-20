import { copyFile, cp, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getErrorMessage } from "../../shared/errors/getErrorMessage";
/** Resolves a filesystem path, retaining the input when the path cannot be resolved. */
export async function resolveRealPath(path: string) {
  const requestedPath = String(path ?? "").trim();
  if (!requestedPath) return { path: "" };
  try {
    return { path: await realpath(requestedPath) };
  } catch {
    return { path: requestedPath };
  }
}
/** Copies files and directories into the destination directory. */
export async function copyFiles(input: { sourcePaths?: string[]; destinationDirectory?: string }) {
  try {
    const sourcePaths = Array.isArray(input?.sourcePaths) ? input.sourcePaths : [];
    const destinationDirectory = String(input?.destinationDirectory ?? "");
    if (!sourcePaths.length) return { ok: false as const, error: "sourcePaths is required" };
    if (!destinationDirectory) return { ok: false as const, error: "destinationDirectory is required" };
    await mkdir(destinationDirectory, { recursive: true });
    const copiedPaths: string[] = [];
    for (const sourcePath of sourcePaths) {
      const destinationPath = join(destinationDirectory, basename(sourcePath));
      if ((await stat(sourcePath)).isDirectory()) await cp(sourcePath, destinationPath, { recursive: true });
      else await copyFile(sourcePath, destinationPath);
      copiedPaths.push(destinationPath);
    }
    return { ok: true as const, copiedPaths };
  } catch (error: unknown) {
    return { ok: false as const, error: getErrorMessage(error) };
  }
}
/** Writes a base64 payload to an absolute file path. */
export async function writeFileBase64(input: { absolutePath?: string; contentBase64?: string }) {
  try {
    const absolutePath = String(input?.absolutePath ?? "");
    const contentBase64 = String(input?.contentBase64 ?? "");
    if (!absolutePath) return { ok: false as const, error: "absolutePath is required" };
    if (!contentBase64) return { ok: false as const, error: "contentBase64 is required" };
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(contentBase64, "base64"));
    return { ok: true as const };
  } catch (error: unknown) {
    return { ok: false as const, error: getErrorMessage(error) };
  }
}

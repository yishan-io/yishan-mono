import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExternalAppId } from "../../shared/contracts/externalApps";
import { launchExternalApp } from "./externalAppLauncher";
import { openInDefaultApplication, openInFileManager } from "./fileManagerLauncher";
/** Resolves a workspace entry and opens it in the selected host application. */
export async function openWorkspaceEntry(input: {
  workspaceWorktreePath: string;
  relativePath?: string;
  appId: ExternalAppId | "system-default" | "system-file-manager";
}) {
  const path = resolve(input.workspaceWorktreePath, input.relativePath ?? ".");
  if (input.appId === "system-file-manager") {
    let isDirectory = true;
    try {
      isDirectory = (await stat(path)).isDirectory();
    } catch {}
    await openInFileManager(path, isDirectory);
  } else if (input.appId === "system-default") {
    await openInDefaultApplication(path);
  } else await launchExternalApp(path, input.appId);
  return { ok: true as const };
}

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Context } from "@deepseek-ai/cordis";
import * as skillFilesystem from "@deepseek-ai/dsh-skill-filesystem";

export const name = "dsh-dev-flow";
export const inject = ["skills"];

export type DevFlowSkillsConfig = {
  skillDirectory?: string;
};

type PathExists = (path: string) => boolean;

/** Mounts packaged Yishan workflow skills through DSH's native filesystem provider. */
export async function apply(context: Context, config: DevFlowSkillsConfig = {}): Promise<void> {
  const skillDirectory = config.skillDirectory ?? resolveDevFlowSkillDirectory();
  await context.plugin(skillFilesystem, {
    providerName: "yishan-dev-flow",
    includeDefaultRoots: false,
    bundledSkillDir: skillDirectory,
    customSkillDirs: [],
    watch: false,
  });
}

/** Resolves managed-plugin assets first, then this package's source skill directory. */
export function resolveDevFlowSkillDirectory(moduleUrl = import.meta.url, pathExists: PathExists = existsSync): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  const candidates = [resolve(moduleDirectory, "skills"), resolve(moduleDirectory, "..", "skills")];
  const skillDirectory = candidates.find(pathExists);
  if (skillDirectory !== undefined) return skillDirectory;

  throw new Error("Yishan development workflow skills are unavailable");
}

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Context } from "@deepseek-ai/cordis";

export const name = "dsh-dev-flow";
export const inject = ["skills"];

export type DevFlowSkillsConfig = {
  skillDirectory?: string;
};

type PathExists = (path: string) => boolean;

const YISHAN_BUNDLED_SKILL_RANK = 600;

/** Registers packaged Yishan workflow skills through DSH's native registry. */
export async function apply(context: Context, config: DevFlowSkillsConfig = {}): Promise<void> {
  const skillDirectory = config.skillDirectory ?? resolveDevFlowSkillDirectory();
  const entries = (await readdir(skillDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const skills = context.get("skills");
  if (!skills) throw new Error("DSH skill registry is unavailable");
  const definitions = await Promise.all(
    entries.map(async (entry) => {
      const directory = resolve(skillDirectory, entry.name);
      return {
        ...parseSkillDefinition(await readFile(resolve(directory, "SKILL.md"), "utf8")),
        source: "bundled" as const,
        provider: "yishan-dev-flow",
        invocation: { modelInvocable: true, userInvocable: true },
        resourceBase: { kind: "directory" as const, path: directory },
        path: resolve(directory, "SKILL.md"),
      };
    }),
  );
  const definitionsByName = new Map(definitions.map((definition) => [definition.name, definition]));
  skills.registerProvider(() => ({
    name: "yishan-dev-flow",
    list: async () =>
      definitions.map(({ content: _content, ...definition }) => ({
        ...definition,
        rank: YISHAN_BUNDLED_SKILL_RANK,
        locator: definition.name,
      })),
    get: async (candidate) => definitionsByName.get(String(candidate.locator)),
  }));
}

/** Resolves managed-plugin assets first, then this package's source skill directory. */
function parseSkillDefinition(markdown: string): { name: string; description: string; content: string } {
  const normalized = markdown.replaceAll("\r\n", "\n");
  const match = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n([\s\S]*)$/.exec(normalized);
  const name = match?.[1];
  const description = match?.[2];
  const content = match?.[3];
  if (!name || description === undefined || content === undefined) {
    throw new Error("Invalid Yishan development workflow skill metadata");
  }
  return { name, description, content: content.trimStart() };
}

export function resolveDevFlowSkillDirectory(moduleUrl = import.meta.url, pathExists: PathExists = existsSync): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  const candidates = [resolve(moduleDirectory, "skills"), resolve(moduleDirectory, "..", "skills")];
  const skillDirectory = candidates.find(pathExists);
  if (skillDirectory !== undefined) return skillDirectory;

  throw new Error("Yishan development workflow skills are unavailable");
}

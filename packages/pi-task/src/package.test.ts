import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const SKILL_NAMES = ["context-task", "starting-task", "finishing-task", "executing-plans"];

describe("pi-task package manifest", () => {
  it("publishes its package-owned workflow skills", async () => {
    const manifest = JSON.parse(await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8")) as {
      files: string[];
      pi: { skills?: string[] };
    };

    expect(manifest.pi.skills).toEqual(["./skills"]);
    expect(manifest.files).toContain("skills");
    await Promise.all(SKILL_NAMES.map((name) => access(resolve(PACKAGE_ROOT, "skills", name, "SKILL.md"))));
  });
});

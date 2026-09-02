import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Context } from "@deepseek-ai/cordis";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import { afterEach, describe, expect, it } from "vitest";

import { apply, resolveDevFlowSkillDirectory } from "./plugin";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillDirectory = resolve(packageDirectory, "skills");
let context: Context | undefined;

afterEach(async () => {
  await context?.fiber.dispose();
  context = undefined;
});

describe("dsh dev-flow skills", () => {
  it("registers every packaged development workflow skill through the native DSH registry", async () => {
    context = new Context();
    await context.plugin(SkillRegistry);
    await context.plugin(apply, { skillDirectory });

    const expected = (await readdir(skillDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const catalog = await context.skills.list({ cwd: packageDirectory });

    expect(catalog.map(({ name }) => name).sort()).toEqual(expected);
    expect(catalog.every(({ provider }) => provider === "yishan-dev-flow")).toBe(true);
  });

  it("preserves native precedence for higher-priority skill providers", async () => {
    context = new Context();
    await context.plugin(SkillRegistry);
    context.skills.registerProvider(() => ({
      name: "project-skills",
      list: async () => [
        {
          name: "brainstorm",
          description: "Project override",
          invocation: { modelInvocable: true, userInvocable: true },
          source: "project-dsh",
          provider: "project-skills",
          rank: 100,
          locator: "brainstorm",
        },
      ],
      get: async () => ({
        name: "brainstorm",
        description: "Project override",
        content: "# Project Brainstorm",
        invocation: { modelInvocable: true, userInvocable: true },
        source: "project-dsh",
        provider: "project-skills",
      }),
    }));
    await context.plugin(apply, { skillDirectory });

    await expect(context.skills.get("brainstorm", { cwd: packageDirectory })).resolves.toMatchObject({
      provider: "project-skills",
      content: "# Project Brainstorm",
    });
  });

  it("loads skill bodies and preserves companion-resource bases", async () => {
    context = new Context();
    await context.plugin(SkillRegistry);
    await context.plugin(apply, { skillDirectory });

    const skill = await context.skills.get("test-driven-development", { cwd: packageDirectory });

    expect(skill?.content).toContain("Red-Green-Refactor");
    expect(skill?.resourceBase).toEqual({
      kind: "directory",
      path: resolve(skillDirectory, "test-driven-development"),
    });
    await expect(readdir(resolve((skill?.resourceBase as { path: string }).path))).resolves.toContain(
      "testing-anti-patterns.md",
    );
  });

  it("loads the compiled managed plugin without source dependencies", async () => {
    context = new Context();
    await context.plugin(SkillRegistry);
    const managedPlugin = await import(pathToFileURL(resolve(packageDirectory, "entry.mjs")).href);

    await context.plugin(managedPlugin);

    await expect(context.skills.get("brainstorm", { cwd: packageDirectory })).resolves.toMatchObject({
      provider: "yishan-dev-flow",
      content: expect.stringContaining("# Brainstorm"),
    });
  });

  it("resolves skills beside the managed plugin entrypoint", () => {
    const moduleUrl = new URL("file:///snapshot/plugins/dsh-dev-flow/entry.mjs").href;
    expect(resolveDevFlowSkillDirectory(moduleUrl, (path) => path === "/snapshot/plugins/dsh-dev-flow/skills")).toBe(
      "/snapshot/plugins/dsh-dev-flow/skills",
    );
  });
});

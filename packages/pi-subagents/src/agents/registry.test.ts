import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AgentRegistry } from "./registry";

const createdTempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-subagents-"));
  createdTempDirs.push(tempDir);
  return tempDir;
}

function writeAgentFile(dir: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Explore.md"), content, "utf8");
}

afterEach(() => {
  for (const tempDir of createdTempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("AgentRegistry", () => {
  it("looks up validation diagnostics for an invalid higher-precedence agent", () => {
    const tempDir = createTempDir();
    const builtinAgentsDir = join(tempDir, "builtin-agents");
    const userAgentsDir = join(tempDir, "user-agents");
    writeAgentFile(builtinAgentsDir, "---\nname: Explore\ndescription: Builtin\n---\n\nBuiltin prompt");
    writeAgentFile(userAgentsDir, "---\nname: Explore\ndescription: User\ntools: web_fetch\n---\n\nUser prompt");
    const registry = new AgentRegistry({ cwd: tempDir, builtinAgentsDir, userAgentsDir, projectAgentsDir: null });

    registry.reload();

    expect(registry.getByName("Explore")).toBeUndefined();
    expect(registry.getInvalidByName(" explore ")).toMatchObject({
      name: "Explore",
      diagnostics: [{ message: "Agent field `tools` contains unknown tools: web_fetch" }],
    });
  });
});

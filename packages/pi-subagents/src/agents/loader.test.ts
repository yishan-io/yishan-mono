import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findNearestProjectAgentsDir,
  loadAgentDefinitionFile,
  loadAgentDefinitions,
  loadAgentDefinitionsFromDir,
  normalizeAgentName,
} from "../index";

const createdTempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-subagents-"));
  createdTempDirs.push(tempDir);
  return tempDir;
}

function writeAgentFile(dir: string, fileName: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, fileName);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

afterEach(() => {
  while (createdTempDirs.length > 0) {
    const tempDir = createdTempDirs.pop();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe("normalizeAgentName", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeAgentName("  Explore  ")).toBe("explore");
  });
});

describe("findNearestProjectAgentsDir", () => {
  it("returns the nearest ancestor .pi/agents directory", () => {
    const tempDir = createTempDir();
    const projectAgentsDir = join(tempDir, ".pi", "agents");
    const nestedDir = join(tempDir, "apps", "desktop");
    mkdirSync(projectAgentsDir, { recursive: true });
    mkdirSync(nestedDir, { recursive: true });

    expect(findNearestProjectAgentsDir(nestedDir)).toBe(projectAgentsDir);
  });

  it("returns null when no ancestor .pi/agents directory exists", () => {
    const tempDir = createTempDir();
    const nestedDir = join(tempDir, "apps", "desktop");
    mkdirSync(nestedDir, { recursive: true });

    expect(findNearestProjectAgentsDir(nestedDir)).toBeNull();
  });
});

describe("loadAgentDefinitionFile", () => {
  it("loads and normalizes one valid agent definition", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "Explore.md",
      `---
name: Explore
description: Search the codebase
model: claude-haiku-4-5
thinking: low
tools:
  - read
  - grep
default_background: true
max_turns: 12
timeout_seconds: 30
read_only: true
---

Use focused codebase search.`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "builtin" });

    expect(result.diagnostics).toEqual([]);
    expect(result.agent).toMatchObject({
      name: "Explore",
      description: "Search the codebase",
      model: "claude-haiku-4-5",
      thinking: "low",
      tools: ["read", "grep"],
      defaultBackground: true,
      maxTurns: 12,
      timeoutMs: 30000,
      readOnly: true,
      source: "builtin",
      sourcePath: filePath,
      systemPrompt: "Use focused codebase search.",
    });
  });

  it("returns a diagnostic for invalid frontmatter syntax", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "Broken.md",
      `---
name: [broken
---

This file has invalid YAML.`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "user" });

    expect(result.agent).toBeUndefined();
    expect(result.diagnostics).toEqual([{ message: "Failed to parse agent definition file", path: filePath }]);
  });

  it("returns diagnostics for missing required fields", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "Missing.md",
      `---
name: Explore
---

Prompt body`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "user" });

    expect(result.agent).toBeUndefined();
    expect(result.diagnostics).toEqual([
      { message: "Agent field `description` must be a non-empty string", path: filePath },
    ]);
  });

  it("returns diagnostics for unknown tools", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "UnknownTool.md",
      `---
name: Explore
description: Search the codebase
tools:
  - read
  - deploy
---

Prompt body`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "project" });

    expect(result.agent).toBeUndefined();
    expect(result.diagnostics).toEqual([
      { message: "Agent field `tools` contains unknown tools: deploy", path: filePath },
    ]);
  });
});

describe("loadAgentDefinitionsFromDir", () => {
  it("returns no agents when the directory does not exist", () => {
    const tempDir = createTempDir();
    const result = loadAgentDefinitionsFromDir({
      dir: join(tempDir, "missing"),
      source: "user",
    });

    expect(result).toEqual({ agents: [], diagnostics: [] });
  });
});

describe("loadAgentDefinitions", () => {
  it("applies project over user over builtin precedence", () => {
    const tempDir = createTempDir();
    const builtinDir = join(tempDir, "builtin-agents");
    const userDir = join(tempDir, "user-agents");
    const projectDir = join(tempDir, "project", ".pi", "agents");

    writeAgentFile(
      builtinDir,
      "Explore.md",
      `---
name: Explore
description: Builtin explore
tools: read,grep
---

Builtin prompt`,
    );
    writeAgentFile(
      userDir,
      "Explore.md",
      `---
name: Explore
description: User explore
tools: read,grep,find
---

User prompt`,
    );
    writeAgentFile(
      projectDir,
      "Explore.md",
      `---
name: Explore
description: Project explore
tools: read,grep,find,ls
---

Project prompt`,
    );
    writeAgentFile(
      builtinDir,
      "General.md",
      `---
name: General
description: Builtin generalist
tools: read,find,ls
---

General prompt`,
    );

    const result = loadAgentDefinitions({
      cwd: join(tempDir, "project", "apps", "desktop"),
      builtinAgentsDir: builtinDir,
      userAgentsDir: userDir,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.agents).toHaveLength(2);
    expect(result.agents).toContainEqual(
      expect.objectContaining({
        name: "Explore",
        description: "Project explore",
        source: "project",
        tools: ["read", "grep", "find", "ls"],
        systemPrompt: "Project prompt",
      }),
    );
    expect(result.agents).toContainEqual(
      expect.objectContaining({
        name: "General",
        description: "Builtin generalist",
        source: "builtin",
      }),
    );
  });
});

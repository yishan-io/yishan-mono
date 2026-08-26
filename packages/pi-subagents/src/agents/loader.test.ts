import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { LoadAgentDefinitionsFromDirResult } from "./loader";
import type { AgentRegistrySnapshot } from "./types";

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
  it("accepts the max thinking level (pi-agent-core ThinkingLevel includes it)", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "Explorer.md",
      `---
name: Explorer
description: Search hard
thinking: max
---

Search.`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "builtin" });

    expect(result.diagnostics).toEqual([]);
    expect(result.agent?.thinking).toBe("max");
  });

  it("rejects an unknown thinking level", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "Explorer.md",
      `---
name: Explorer
description: Search hard
thinking: ultra
---

Search.`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "builtin" });

    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes("thinking"))).toBe(true);
  });

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

  it("accepts extension-registered LSP tools in agent tool lists", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "LspAgent.md",
      `---
name: LspAgent
description: Implement and verify changes
tools:
  - read
  - bash
  - lsp_diagnostics
  - lsp_fix
---

Prompt body`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "user" });

    expect(result.agent).toBeDefined();
    expect(result.agent?.tools).toEqual(["read", "bash", "lsp_diagnostics", "lsp_fix"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("shadows a builtin agent with an invalid higher-precedence definition", () => {
    const tempDir = createTempDir();
    const builtinAgentsDir = join(tempDir, "builtin-agents");
    const userAgentsDir = join(tempDir, "user-agents");

    writeAgentFile(
      builtinAgentsDir,
      "Explore.md",
      `---
name: Explore
description: Search the codebase
tools:
  - read
---

Builtin prompt`,
    );
    const userFilePath = writeAgentFile(
      userAgentsDir,
      "Explore.md",
      `---
name: Explore
description: Search the web and codebase
tools:
  - read
  - web_fetch
---

User prompt`,
    );

    const result = loadAgentDefinitions({
      cwd: tempDir,
      builtinAgentsDir,
      userAgentsDir,
      projectAgentsDir: null,
    });

    expect(result.agents).toEqual([]);
    expect(result.invalidAgentsByName?.get("explore")).toEqual({
      name: "Explore",
      source: "user",
      sourcePath: userFilePath,
      diagnostics: [{ message: "Agent field `tools` contains unknown tools: web_fetch", path: userFilePath }],
    });
  });

  it("allows a valid higher-precedence definition to override a builtin agent", () => {
    const tempDir = createTempDir();
    const builtinAgentsDir = join(tempDir, "builtin-agents");
    const userAgentsDir = join(tempDir, "user-agents");

    writeAgentFile(
      builtinAgentsDir,
      "Explore.md",
      `---
name: Explore
description: Builtin
---

Builtin prompt`,
    );
    writeAgentFile(
      userAgentsDir,
      "Explore.md",
      `---
name: Explore
description: User
---

User prompt`,
    );

    const result = loadAgentDefinitions({ cwd: tempDir, builtinAgentsDir, userAgentsDir, projectAgentsDir: null });

    expect(result.agents).toEqual([expect.objectContaining({ name: "Explore", description: "User", source: "user" })]);
    expect(result.invalidAgentsByName?.size).toBe(0);
  });

  it("loads conflicting read_only frontmatter but emits a diagnostic", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "Reviewer.md",
      `---
name: Reviewer
description: Review code
tools:
  - read
  - bash
read_only: true
---

Prompt body`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "builtin" });

    expect(result.agent).toMatchObject({
      name: "Reviewer",
      tools: ["read", "bash"],
      readOnly: true,
    });
    expect(result.diagnostics).toEqual([
      {
        message: "Agent field `read_only` conflicts with tool-derived workspace access: write",
        path: filePath,
      },
    ]);
  });

  it("emits a diagnostic when read_only false conflicts with read-only tools", () => {
    const tempDir = createTempDir();
    const filePath = writeAgentFile(
      tempDir,
      "Searcher.md",
      `---
name: Searcher
description: Search code
tools:
  - read
  - grep
read_only: false
---

Prompt body`,
    );

    const result = loadAgentDefinitionFile({ filePath, source: "builtin" });

    expect(result.agent).toMatchObject({
      name: "Searcher",
      tools: ["read", "grep"],
      readOnly: false,
    });
    expect(result.diagnostics).toEqual([
      {
        message: "Agent field `read_only` conflicts with tool-derived workspace access: read",
        path: filePath,
      },
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

    expect(result).toEqual({ agents: [], invalidAgents: [], diagnostics: [] });
  });
});

describe("public loader result compatibility", () => {
  it("accepts snapshots produced before invalid definition metadata was added", () => {
    const legacySnapshot: AgentRegistrySnapshot = { agents: [], diagnostics: [] };
    const legacyDirectoryResult: LoadAgentDefinitionsFromDirResult = { agents: [], diagnostics: [] };

    expect(legacySnapshot.agents).toEqual([]);
    expect(legacyDirectoryResult.agents).toEqual([]);
  });
});

describe("loadAgentDefinitions", () => {
  it("allows a later valid file to override an earlier invalid file with the same name", () => {
    const tempDir = createTempDir();
    const builtinAgentsDir = join(tempDir, "builtin-agents");

    writeAgentFile(
      builtinAgentsDir,
      "A.md",
      "---\nname: Explore\ndescription: Invalid\ntools: web_fetch\n---\n\nInvalid prompt",
    );
    writeAgentFile(builtinAgentsDir, "B.md", "---\nname: Explore\ndescription: Valid\n---\n\nValid prompt");

    const result = loadAgentDefinitions({
      cwd: tempDir,
      builtinAgentsDir,
      userAgentsDir: join(tempDir, "missing-user-agents"),
      projectAgentsDir: null,
    });

    expect(result.agents).toEqual([expect.objectContaining({ name: "Explore", description: "Valid" })]);
    expect(result.invalidAgentsByName?.size).toBe(0);
  });

  it("allows a later invalid file to shadow an earlier valid file with the same name", () => {
    const tempDir = createTempDir();
    const builtinAgentsDir = join(tempDir, "builtin-agents");

    writeAgentFile(builtinAgentsDir, "A.md", "---\nname: Explore\ndescription: Valid\n---\n\nValid prompt");
    writeAgentFile(
      builtinAgentsDir,
      "B.md",
      "---\nname: Explore\ndescription: Invalid\ntools: web_fetch\n---\n\nInvalid prompt",
    );

    const result = loadAgentDefinitions({
      cwd: tempDir,
      builtinAgentsDir,
      userAgentsDir: join(tempDir, "missing-user-agents"),
      projectAgentsDir: null,
    });

    expect(result.agents).toEqual([]);
    expect(result.invalidAgentsByName?.get("explore")).toMatchObject({ name: "Explore", source: "builtin" });
  });

  it("allows an invalid project definition to shadow valid user and builtin definitions", () => {
    const tempDir = createTempDir();
    const builtinAgentsDir = join(tempDir, "builtin-agents");
    const userAgentsDir = join(tempDir, "user-agents");
    const projectAgentsDir = join(tempDir, "project-agents");

    writeAgentFile(builtinAgentsDir, "Explore.md", "---\nname: Explore\ndescription: Builtin\n---\n\nBuiltin prompt");
    writeAgentFile(userAgentsDir, "Explore.md", "---\nname: Explore\ndescription: User\n---\n\nUser prompt");
    writeAgentFile(
      projectAgentsDir,
      "Explore.md",
      "---\nname: Explore\ndescription: Project\ntools: web_fetch\n---\n\nProject prompt",
    );

    const result = loadAgentDefinitions({ cwd: tempDir, builtinAgentsDir, userAgentsDir, projectAgentsDir });

    expect(result.agents).toEqual([]);
    expect(result.invalidAgentsByName?.get("explore")).toMatchObject({ name: "Explore", source: "project" });
  });
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

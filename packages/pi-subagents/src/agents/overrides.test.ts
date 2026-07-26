import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyAgentRuntimeOverrides, loadAgentRuntimeOverrides } from "./overrides";
import type { AgentDefinition } from "./types";

const createdTempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-subagents-overrides-"));
  createdTempDirs.push(tempDir);
  return tempDir;
}

function createAgentDefinition(name: string): AgentDefinition {
  return {
    name,
    description: `${name} agent`,
    systemPrompt: `${name} prompt`,
    tools: ["read"],
    source: "builtin",
  };
}

function writeOverridesFile(tempDir: string, content: string): string {
  const filePath = join(tempDir, "agent.overrides.json");
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

describe("loadAgentRuntimeOverrides", () => {
  it("loads valid patches for known agents and keeps valid sibling entries when one known entry is invalid", () => {
    const tempDir = createTempDir();
    const filePath = writeOverridesFile(
      tempDir,
      JSON.stringify({
        Explore: { model: "gpt-5.6-terra" },
        Builder: { thinking: "high" },
        General: { tools: ["bash"] },
      }),
    );

    const result = loadAgentRuntimeOverrides({ filePath, knownAgentNames: ["explore", "builder", "general"] });

    expect(result.overrides).toEqual([
      { name: "Explore", model: "gpt-5.6-terra" },
      { name: "Builder", thinking: "high" },
    ]);
    expect(result.diagnostics).toEqual([{ message: "Agent override field `tools` is not supported", path: filePath }]);
  });

  it("does not apply a known entry when any supported field is invalid", () => {
    const tempDir = createTempDir();
    const filePath = writeOverridesFile(
      tempDir,
      JSON.stringify({ Explore: { model: "gpt-5.6-terra", thinking: "unsupported" } }),
    );

    const result = loadAgentRuntimeOverrides({ filePath, knownAgentNames: ["Explore"] });

    expect(result.overrides).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        message: "Agent override `Explore` field `thinking` must be one of off|minimal|low|medium|high|xhigh",
        path: filePath,
      },
    ]);
  });

  it("silently skips unknown entries before validating their values", () => {
    const tempDir = createTempDir();
    const filePath = writeOverridesFile(
      tempDir,
      JSON.stringify({
        FutureAgent: { tools: ["deploy"] },
        Explore: { thinking: "low" },
      }),
    );

    const result = loadAgentRuntimeOverrides({ filePath, knownAgentNames: ["Explore"] });

    expect(result.overrides).toEqual([{ name: "Explore", thinking: "low" }]);
    expect(result.diagnostics).toEqual([]);
  });

  it("does not report a missing optional file", () => {
    const tempDir = createTempDir();
    const result = loadAgentRuntimeOverrides({
      filePath: join(tempDir, "agent.overrides.json"),
      knownAgentNames: ["Explore"],
    });

    expect(result).toEqual({ overrides: [], diagnostics: [] });
  });

  it("reports non-missing file read errors", () => {
    const tempDir = createTempDir();
    const result = loadAgentRuntimeOverrides({ filePath: tempDir, knownAgentNames: ["Explore"] });

    expect(result).toEqual({
      overrides: [],
      diagnostics: [{ message: "Failed to read agent overrides file", path: tempDir }],
    });
  });

  it("reports malformed JSON", () => {
    const tempDir = createTempDir();
    const filePath = writeOverridesFile(tempDir, "{");

    const result = loadAgentRuntimeOverrides({ filePath, knownAgentNames: ["Explore"] });

    expect(result).toEqual({
      overrides: [],
      diagnostics: [{ message: "Failed to parse agent overrides file", path: filePath }],
    });
  });

  it("reports duplicate normalized known names and does not apply either patch", () => {
    const tempDir = createTempDir();
    const filePath = writeOverridesFile(
      tempDir,
      JSON.stringify({
        Explore: { model: "gpt-5.6-terra" },
        explore: { thinking: "high" },
      }),
    );

    const result = loadAgentRuntimeOverrides({ filePath, knownAgentNames: ["Explore"] });

    expect(result.overrides).toEqual([]);
    expect(result.diagnostics).toEqual([{ message: "Duplicate agent override for `Explore`", path: filePath }]);
  });
});

describe("applyAgentRuntimeOverrides", () => {
  it("patches only model and thinking without replacing the definition", () => {
    const agentDefinition = createAgentDefinition("Explore");

    const agents = applyAgentRuntimeOverrides(
      [agentDefinition],
      [
        { name: "explore", model: "gpt-5.6-terra", thinking: "medium" },
        { name: "unknown", model: "ignored" },
      ],
    );

    expect(agents).toEqual([
      {
        ...agentDefinition,
        model: "gpt-5.6-terra",
        thinking: "medium",
      },
    ]);
  });
});

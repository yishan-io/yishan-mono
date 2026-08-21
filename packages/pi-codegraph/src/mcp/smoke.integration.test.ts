import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CodeGraphMcpClient } from "./client";

const fixtureDirectories: string[] = [];

afterEach(() => {
  for (const fixtureDirectory of fixtureDirectories.splice(0))
    rmSync(fixtureDirectory, { force: true, recursive: true });
});

/** Confirms the installed CodeGraph CLI can serve the native MCP client against a fresh project. */
describe("CodeGraphMcpClient CLI smoke", () => {
  it("initializes a disposable fixture, then serves status and search", async () => {
    assertCodeGraphCliAvailable();
    const projectPath = createFixtureProject();
    initializeCodeGraph(projectPath);
    const client = new CodeGraphMcpClient({ timeoutMs: 60_000 });

    const status = await client.call({ toolName: "codegraph_status", arguments: {}, projectPath });
    const search = await client.call({
      toolName: "codegraph_search",
      arguments: { query: "greet", limit: 10 },
      projectPath,
    });

    expect(status.text).not.toBe("");
    expect(search.text).toContain("greet");
  }, 90_000);
});

function assertCodeGraphCliAvailable(): void {
  const command = spawnSync("codegraph", ["--version"], { encoding: "utf8" });
  if (command.error && "code" in command.error && command.error.code === "ENOENT") {
    throw new Error(
      "CodeGraph CLI smoke test requires `codegraph` on PATH; install CodeGraph before running package tests.",
    );
  }
  if (command.status !== 0) {
    throw new Error(
      `CodeGraph CLI smoke test could not run \`codegraph --version\`: ${command.stderr || command.stdout}`,
    );
  }
}

function createFixtureProject(): string {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), "pi-codegraph-smoke-"));
  fixtureDirectories.push(projectPath);
  writeFileSync(
    path.join(projectPath, "greet.ts"),
    "export function greet(name: string): string { return `Hello ${name}`; }\nexport function run(): string { return greet('Pi'); }\n",
  );
  return projectPath;
}

function initializeCodeGraph(projectPath: string): void {
  try {
    execFileSync("codegraph", ["init", projectPath], { encoding: "utf8", timeout: 60_000 });
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : "unknown failure";
    throw new Error(`CodeGraph CLI smoke test could not initialize fixture: ${diagnostic}`);
  }
}

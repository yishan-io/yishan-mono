import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { mockContext, mockPi, restoreEnv } from "../../test/support";
import { registerLspTools } from "./registerLspTools";

describe("registerLspTools", () => {
  test("registers the diagnostics and fix tools", () => {
    const mock = mockPi();
    registerLspTools(mock.pi);
    expect(mock.tools.map((tool) => tool.name)).toEqual(["lsp_diagnostics", "lsp_fix"]);
  });

  test("trust gating applies to tool execution", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-tools-trust-"));
    const agentDir = path.join(root, "agent");
    const project = path.join(root, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(path.join(project, ".pi"), { recursive: true });
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const config = (name: string) => ({
      servers: { [name]: { command: [name], extensions: [`.${name}`] } },
    });
    writeFileSync(path.join(agentDir, "lsp.json"), JSON.stringify(config("user")));
    writeFileSync(path.join(project, ".pi", "lsp.json"), JSON.stringify(config("project")));

    try {
      const mock = mockPi();
      registerLspTools(mock.pi);
      const diagnostics = mock.tools.find((tool) => tool.name === "lsp_diagnostics");
      expect(diagnostics).toBeTruthy();
      const execute = diagnostics?.execute as (...args: unknown[]) => Promise<unknown>;

      const untrusted = mockContext({ cwd: project, isProjectTrusted: () => false });
      await expect(execute("trust-test", { server: "missing" }, undefined, undefined, untrusted.ctx)).rejects.toThrow(
        /Configured LSP servers: user/,
      );

      const trusted = mockContext({ cwd: project, isProjectTrusted: () => true });
      await expect(execute("trust-test", { server: "missing" }, undefined, undefined, trusted.ctx)).rejects.toThrow(
        /Configured LSP servers: project/,
      );

      unlinkSync(path.join(project, ".pi", "lsp.json"));
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

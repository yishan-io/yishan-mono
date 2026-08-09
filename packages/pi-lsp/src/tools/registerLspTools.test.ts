import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { mockContext, mockPi, restoreEnv } from "../../test/support";
import { registerLspTools, reportSkippedServers } from "./registerLspTools";
import type { DiagnosticRoute } from "./selectServers";

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
        /Configured LSP servers: .*user/,
      );

      const trusted = mockContext({ cwd: project, isProjectTrusted: () => true });
      await expect(execute("trust-test", { server: "missing" }, undefined, undefined, trusted.ctx)).rejects.toThrow(
        /Configured LSP servers: .*project/,
      );

      unlinkSync(path.join(project, ".pi", "lsp.json"));
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("skipped-server reporting stays quiet for unrelated or unscoped requests", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-skip-report-"));
    try {
      mkdirSync(path.join(root, "src"));
      writeFileSync(path.join(root, "src", "main.rs"), "fn main() {}\n");
      writeFileSync(path.join(root, "Makefile"), "all:\n");
      const skipped = [
        {
          server: { name: "rust-analyzer", extensions: [".rs"] },
          reason: "rust-analyzer command missing",
          files: [],
        },
      ] as unknown as DiagnosticRoute[];
      // Workspace-wide scan with results: unconfigured defaults stay quiet.
      expect(reportSkippedServers(skipped, [{}], undefined, root)).toBe(false);
      // Nothing ran, no explicit paths: the full list explains why.
      expect(reportSkippedServers(skipped, [], undefined, root)).toBe(true);
      // Explicit file path matching the skipped server's extension.
      expect(reportSkippedServers(skipped, [{}], ["src/main.rs"], root)).toBe(true);
      // Explicit directory path: the skipped server would have scanned it.
      expect(reportSkippedServers(skipped, [{}], ["src/"], root)).toBe(true);
      expect(reportSkippedServers(skipped, [{}], ["src"], root)).toBe(true);
      // Dot-named directory must not false-positive as a matching extension.
      expect(reportSkippedServers(skipped, [{}], ["src/.hidden/"], root)).toBe(false);
      mkdirSync(path.join(root, "src", ".hidden"));
      expect(reportSkippedServers(skipped, [{}], ["src/.hidden/"], root)).toBe(true);
      // File without a matching extension stays quiet.
      expect(reportSkippedServers(skipped, [{}], ["Makefile"], root)).toBe(false);
      expect(reportSkippedServers(skipped, [{}], ["src/app.ts"], root)).toBe(false);
      // Missing file still matches by extension.
      expect(reportSkippedServers(skipped, [{}], ["src/new.rs"], root)).toBe(true);
      // Nothing ran with paths: only in-scope skipped servers are reported.
      expect(reportSkippedServers(skipped, [], ["src/app.ts"], root)).toBe(false);
      expect(reportSkippedServers(skipped, [], ["src/main.rs"], root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

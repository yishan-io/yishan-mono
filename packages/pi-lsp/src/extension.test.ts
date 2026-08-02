import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { mockContext, mockPi, restoreEnv } from "../test/support";
import { createPiLspExtension } from "./extension";

describe("pi-lsp extension", () => {
  test("registers tools, the /lsp command, and session hooks", () => {
    const mock = mockPi();
    createPiLspExtension(mock.pi);
    expect(mock.tools.map((tool) => tool.name)).toEqual(["lsp_diagnostics", "lsp_fix"]);
    expect(mock.commands.has("lsp")).toBe(true);
    expect([...mock.events.keys()].sort()).toEqual(["session_shutdown", "session_start"]);
  });

  test("/lsp reports only trusted-server commands", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-ext-command-"));
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
      unlinkSync(path.join(project, ".pi", "lsp.json"));
      writeFileSync(path.join(project, ".pi", "lsp.json"), JSON.stringify(config("legacy-project")));

      const mock = mockPi();
      createPiLspExtension(mock.pi);
      const context = mockContext({ cwd: project, isProjectTrusted: () => false });
      await mock.commands.get("lsp")?.handler?.("", context.ctx);

      const lastMessage = context.notifications.at(-1)?.message ?? "";
      expect(lastMessage).toMatch(/user LSP command: user/);
      expect(lastMessage).not.toMatch(/project/);
      expect(lastMessage).not.toMatch(/legacy-project/);
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("session hooks surface config problems as warnings", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-ext-session-"));
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir);
    writeFileSync(path.join(agentDir, "lsp.json"), "not json");
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;

    try {
      const mock = mockPi();
      createPiLspExtension(mock.pi);
      const context = mockContext({ cwd: root });
      const sessionStart = mock.events.get("session_start")?.[0];
      expect(sessionStart).toBeTruthy();
      await sessionStart?.({}, context.ctx);
      expect(context.notifications.at(-1)?.message ?? "").toMatch(/LSP config ignored/);
      expect(context.notifications.at(-1)?.level).toBe("warning");
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

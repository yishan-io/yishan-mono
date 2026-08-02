import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { restoreEnv } from "../../test/support";
import { loadConfig, loadRuntime } from "./config";

function configFor(name: string) {
  return {
    servers: { [name]: { command: [name], extensions: [`.${name}`] } },
  };
}

describe("config loading", () => {
  test("falls back to the built-in catalog with no config", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-config-defaults-"));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
    try {
      const config = loadConfig(root);
      expect(config.servers[0]?.name).toBe("biome");
      expect(config.servers[0]?.isDefault).toBe(true);
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("prefers the user config over defaults", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-config-user-"));
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir);
    writeFileSync(path.join(agentDir, "lsp.json"), JSON.stringify(configFor("user")));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      expect(loadConfig(root).servers[0]?.name).toBe("user");
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("honors the project config only when the project is trusted", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-config-trust-"));
    const agentDir = path.join(root, "agent");
    const project = path.join(root, "project");
    mkdirSync(agentDir);
    mkdirSync(path.join(project, ".pi"), { recursive: true });
    writeFileSync(path.join(agentDir, "lsp.json"), JSON.stringify(configFor("user")));
    writeFileSync(path.join(project, ".pi", "lsp.json"), JSON.stringify(configFor("project")));
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      expect(loadConfig(project, { projectTrusted: false }).servers[0]?.name).toBe("user");
      expect(loadConfig(project, { projectTrusted: true }).servers[0]?.name).toBe("project");
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reads lsp.json from the project and user scopes", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-config-lspjson-"));
    const agentDir = path.join(root, "agent");
    const project = path.join(root, "project");
    mkdirSync(agentDir);
    mkdirSync(path.join(project, ".pi"), { recursive: true });
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      writeFileSync(path.join(agentDir, "lsp.json"), JSON.stringify(configFor("user")));
      expect(loadConfig(project).servers[0]?.name).toBe("user");

      writeFileSync(path.join(project, ".pi", "lsp.json"), JSON.stringify(configFor("project")));
      expect(loadConfig(project, { projectTrusted: true }).servers[0]?.name).toBe("project");
      // Untrusted projects fall back to the user config.
      expect(loadConfig(project, { projectTrusted: false }).servers[0]?.name).toBe("user");
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("throws on invalid config content", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-config-invalid-"));
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir);
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      writeFileSync(path.join(agentDir, "lsp.json"), "not json");
      expect(() => loadConfig(root)).toThrow();
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("validates field shapes", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-config-validation-"));
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir);
    const userConfig = path.join(agentDir, "lsp.json");
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const writeConfig = (config: unknown) => writeFileSync(userConfig, JSON.stringify(config));
    try {
      writeConfig({ servers: { custom: { command: [], extensions: [".foo"] } } });
      expect(() => loadConfig(root)).toThrow(/command must contain at least one string/);

      writeConfig({ servers: { custom: { command: ["x"], extensions: [".foo"], skipDirectories: ["../gen"] } } });
      expect(() => loadConfig(root)).toThrow(/skipDirectories.*directory names/);

      writeConfig({ servers: { custom: { command: ["x"], extensions: [".foo"], diagnosticsSettleMs: 0 } } });
      expect(() => loadConfig(root)).toThrow(/diagnosticsSettleMs must be a positive number/);

      writeConfig({ servers: { custom: { command: ["x"], extensions: [".foo"], pullDiagnosticsGraceMs: 0 } } });
      expect(() => loadConfig(root)).toThrow(/pullDiagnosticsGraceMs must be a positive number/);

      writeConfig({ servers: { custom: { command: ["x"], extensions: [".foo"], env: { PATH: 1 } } } });
      expect(() => loadConfig(root)).toThrow(/env must contain only string values/);
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("applies the wrapper shape with timeout and binds runtime servers", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-config-wrapper-"));
    const agentDir = path.join(root, "agent");
    const project = path.join(root, "project");
    mkdirSync(agentDir);
    mkdirSync(path.join(project, "src"), { recursive: true });
    writeFileSync(path.join(project, "src", "main.foo"), "source\n");
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      writeFileSync(
        path.join(agentDir, "lsp.json"),
        JSON.stringify({
          timeout: 30_000,
          servers: {
            custom: {
              command: ["custom-lsp"],
              extensions: [".foo"],
              env: { LSP_LOG: "debug", PATH: path.join(project, "lsp-bin") },
              skipDirectories: ["generated"],
              diagnosticsSettleMs: 250,
              pushDiagnosticsGraceMs: 375,
              pullDiagnosticsGraceMs: 500,
            },
          },
        }),
      );
      const runtime = loadRuntime(project);
      expect(runtime.timeoutMs).toBe(30_000);
      const server = runtime.servers[0];
      expect(server?.name).toBe("custom");
      expect(server?.isDefault).toBe(false);
      expect(server?.diagnosticsSettleMs).toBe(250);
      expect(server?.pushDiagnosticsGraceMs).toBe(375);
      expect(server?.pullDiagnosticsGraceMs).toBe(500);
      expect(server?.env).toEqual({ LSP_LOG: "debug", PATH: path.join(project, "lsp-bin") });
      expect(server?.skipDirectories.has("generated")).toBe(true);
      expect(server?.skipDirectories.has("node_modules")).toBe(true);
    } finally {
      restoreEnv("PI_CODING_AGENT_DIR", previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

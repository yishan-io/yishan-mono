import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Context } from "@deepseek-ai/cordis";
import { LocalSandboxProvider } from "@deepseek-ai/dsh-sandbox-local";
import { SandboxPolicyService } from "@deepseek-ai/dsh-sandbox-policy";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";
import { describe, expect, it, vi } from "vitest";

import {
  YISHAN_AGENT_SPINE_CONFIG,
  YISHAN_RUNTIME_MCP_ENABLED,
  YISHAN_SANDBOX_POLICY_CONFIG,
  YISHAN_SUBAGENT_SPAWN_CONFIG,
  installCorePlugins,
} from "./corePlugins";
import { YISHAN_BUILDER_PERSONA, YISHAN_DELEGATED_TOOL_FILTER, YISHAN_EXPLORE_PERSONA } from "./delegationTools";
import { SANDBOX_WORKDIR_OUTSIDE_WORKSPACE, YishanSandboxBashExecutor } from "./sandboxBashExecutor";

describe("runtime services", () => {
  it("enables all built-in agent-spine capabilities without MCP", () => {
    expect(YISHAN_RUNTIME_MCP_ENABLED).toBe(false);
    expect(YISHAN_AGENT_SPINE_CONFIG).toEqual({
      workspaceContext: { maxBytes: 16 * 1024 },
      maxParallelToolCalls: 10,
      skills: { enabled: true },
      toolBash: {},
      toolJobs: {},
      goals: {},
    });
    expect(YISHAN_AGENT_SPINE_CONFIG).not.toHaveProperty("mcp");
    expect(YISHAN_SANDBOX_POLICY_CONFIG).toEqual({ mode: "workspace-write", workspaceRoot: process.cwd() });
  });

  it("limits native subagents to fresh direct children on the parent workspace", () => {
    expect(YISHAN_SUBAGENT_SPAWN_CONFIG).toEqual({ providerName: "spawn" });
    expect(YISHAN_DELEGATED_TOOL_FILTER).toEqual({ allow: ["bash", "skill"] });
    expect(YISHAN_EXPLORE_PERSONA).toContain("enforced as read-only");
    expect(YISHAN_BUILDER_PERSONA).toContain("enforced by the runtime");
  });

  it("registers the native spawn provider and fixed-role continuable tools", async () => {
    const context = new Context();
    try {
      await installCorePlugins(context);

      expect(context.shell.sandboxMode).toBe("workspace-write");
      expect(context.sandboxPolicy.resolve()).toEqual({
        mode: "workspace-write",
        workspaceRoot: YISHAN_SANDBOX_POLICY_CONFIG.workspaceRoot,
      });
      expect(context.subagents.getProvider(YISHAN_SUBAGENT_SPAWN_CONFIG.providerName)).toMatchObject({
        name: "spawn",
        inheritsParentContext: false,
      });
      expect(context.tools.get("delegate_explore")).toBeDefined();
      expect(context.tools.get("delegate_builder")).toBeDefined();
      expect(context.tools.get("subagent")).toBeUndefined();
    } finally {
      await context.fiber.dispose();
    }
  });
});

function createSandboxContext(workspaceRoot: string): {
  context: Context;
  sandbox: LocalSandboxProvider;
} {
  const context = new Context();
  new LocalSubprocessRuntime(context);
  new SandboxPolicyService(context, { mode: "workspace-write", workspaceRoot });
  const sandbox = new LocalSandboxProvider(context, {
    runnerCommand: [],
    runnerFailureSignatures: [],
    probeTimeoutMs: 5_000,
  });
  new YishanSandboxBashExecutor(context, {
    cwd: workspaceRoot,
    timeoutMs: 100,
    maxTimeoutMs: 500,
    maxOutputBytes: 64_000,
    maxSpillBytes: 64 * 1024 * 1024,
    graceMs: 10,
  });
  return { context, sandbox };
}

async function disposeSandboxContext(context: Context, root: string): Promise<void> {
  await context.fiber.dispose();
  await rm(root, { recursive: true, force: true });
}

describe("sandboxed Bash", () => {
  it("passes workspace-write and read-only policies to LocalSandboxProvider's real profile selection", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-root-"));
    const { context, sandbox } = createSandboxContext(root);
    sandbox.internals.platform = "linux";
    sandbox.internals.probeBwrap = () => true;
    try {
      expect(
        sandbox.confine(["bash", "-c", "touch /outside"], { mode: "read-only", workspaceRoot: root }).argv,
      ).toEqual(expect.arrayContaining(["bwrap", "--ro-bind", "/", "/", "--", "bash", "-c", "touch /outside"]));
      expect(
        sandbox.confine(["bash", "-c", "touch allowed"], { mode: "workspace-write", workspaceRoot: root }).argv,
      ).toEqual(expect.arrayContaining(["bwrap", "--bind", root, root, "--", "bash", "-c", "touch allowed"]));
    } finally {
      await disposeSandboxContext(context, root);
    }
  });

  it("rejects an outside workspace workdir before invoking the LocalSandboxProvider", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-root-"));
    const outside = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-outside-"));
    const { context, sandbox } = createSandboxContext(root);
    const confine = vi.spyOn(sandbox, "confine");
    try {
      await expect(
        Promise.resolve().then(() =>
          context.shell.run(context.shell.resolve({ command: "touch /outside", workdir: outside })),
        ),
      ).rejects.toMatchObject({ code: SANDBOX_WORKDIR_OUTSIDE_WORKSPACE });
      expect(confine).not.toHaveBeenCalled();
    } finally {
      await context.fiber.dispose();
      await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]);
    }
  });

  it("rejects a workspace symlink that resolves outside before invoking the LocalSandboxProvider", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-root-"));
    const outside = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-outside-"));
    const outsideAlias = join(root, "outside-alias");
    await symlink(outside, outsideAlias, "dir");
    const { context, sandbox } = createSandboxContext(root);
    const confine = vi.spyOn(sandbox, "confine");
    try {
      await expect(
        Promise.resolve().then(() =>
          context.shell.run(context.shell.resolve({ command: "touch blocked", workdir: outsideAlias })),
        ),
      ).rejects.toMatchObject({ code: SANDBOX_WORKDIR_OUTSIDE_WORKSPACE });
      expect(confine).not.toHaveBeenCalled();
    } finally {
      await context.fiber.dispose();
      await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]);
    }
  });

  it("spawns accepted commands from canonical workdirs with a canonical policy root", async () => {
    const canonicalRoot = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-root-"));
    const policyRoot = `${canonicalRoot}-alias`;
    const workdir = await mkdtemp(join(canonicalRoot, "workdir-"));
    const workdirAlias = join(canonicalRoot, "workdir-alias");
    await Promise.all([symlink(canonicalRoot, policyRoot, "dir"), symlink(workdir, workdirAlias, "dir")]);
    const [workspaceRoot, canonicalWorkdir] = await Promise.all([realpath(canonicalRoot), realpath(workdir)]);
    const { context, sandbox } = createSandboxContext(policyRoot);
    const spawn = vi.spyOn(context.subprocess, "spawn");
    const confine = vi.spyOn(sandbox, "confine").mockImplementation((argv) => ({
      argv: [...argv],
      enforcement: "full",
      denialSignatures: [],
      runnerFailureRules: [],
    }));
    try {
      await context.shell.run(context.shell.resolve({ command: "printf run", workdir: workdirAlias }));
      const process = context.shell.start(context.shell.resolve({ command: "printf start", workdir: workdirAlias }));
      await process.done;

      expect(confine).toHaveBeenCalledWith(["bash", "-c", "printf run"], {
        mode: "workspace-write",
        workspaceRoot,
      });
      expect(confine).toHaveBeenCalledWith(["bash", "-c", "printf start"], {
        mode: "workspace-write",
        workspaceRoot,
      });
      expect(spawn).toHaveBeenNthCalledWith(1, expect.objectContaining({ cwd: canonicalWorkdir }));
      expect(spawn).toHaveBeenNthCalledWith(2, expect.objectContaining({ cwd: canonicalWorkdir }));
    } finally {
      await context.fiber.dispose();
      await Promise.all([
        rm(policyRoot, { recursive: true, force: true }),
        rm(canonicalRoot, { recursive: true, force: true }),
      ]);
    }
  });

  it("sends outside-workspace write attempts through the LocalSandboxProvider with the authoritative workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-root-"));
    const { context, sandbox } = createSandboxContext(root);
    const confine = vi.spyOn(sandbox, "confine").mockReturnValue({
      argv: ["bash", "-c", "printf confined"],
      enforcement: "full",
      denialSignatures: [],
      runnerFailureRules: [],
    });
    try {
      await expect(context.shell.run(context.shell.resolve({ command: "touch /outside" }))).resolves.toMatchObject({
        sandbox: { mode: "workspace-write", denied: false },
      });
      expect(confine).toHaveBeenCalledWith(["bash", "-c", "touch /outside"], {
        mode: "workspace-write",
        workspaceRoot: context.sandboxPolicy.resolve().workspaceRoot,
      });
    } finally {
      await disposeSandboxContext(context, root);
    }
  });

  it("fails closed when LocalSandboxProvider cannot select a runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-root-"));
    const { context, sandbox } = createSandboxContext(root);
    sandbox.internals.platform = "unsupported";
    try {
      await expect(context.shell.run(context.shell.resolve({ command: "printf blocked" }))).rejects.toMatchObject({
        code: "SANDBOX_UNAVAILABLE",
      });
    } finally {
      await disposeSandboxContext(context, root);
    }
  });

  it("preserves local timeout and cancellation behavior through the provider seam", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-dsh-sandbox-root-"));
    const { context, sandbox } = createSandboxContext(root);
    vi.spyOn(sandbox, "confine").mockImplementation((argv) => ({
      argv: [...argv],
      enforcement: "full",
      denialSignatures: [],
      runnerFailureRules: [],
    }));
    try {
      await expect(
        context.shell.run(context.shell.resolve({ command: "sleep 1", timeoutMs: 20 })),
      ).resolves.toMatchObject({ timedOut: true, aborted: false });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);
      await expect(
        context.shell.run(context.shell.resolve({ command: "sleep 1", signal: controller.signal, timeoutMs: 500 })),
      ).resolves.toMatchObject({ timedOut: false, aborted: true });
    } finally {
      await disposeSandboxContext(context, root);
    }
  });
});

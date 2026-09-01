import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  dispose: vi.fn<() => Promise<void>>(),
  installCorePlugins: vi.fn<() => Promise<void>>(),
  installProviderPlugin: vi.fn<() => Promise<void>>(),
  installMemoryPlugin: vi.fn<() => Promise<void>>(),
  installTaskPlugin: vi.fn<() => Promise<void>>(),
  installPluginLoader: vi.fn<() => Promise<void>>(),
  bridgeStart: vi.fn(),
}));

vi.mock("@deepseek-ai/cordis", () => ({
  Service: class {},
  Context: class {
    root = { fiber: { dispose: runtimeMocks.dispose } };
    daemonBridge: { start: () => void } | undefined;
    plugin = async (
      plugin:
        | ((context: object, config?: unknown) => unknown)
        | { apply: (context: object, config?: unknown) => unknown },
      config?: unknown,
    ) => {
      const apply = typeof plugin === "function" ? plugin : plugin.apply;
      await apply(this, config);
    };
  },
}));

vi.mock("@yishan-io/dsh-daemon-bridge", () => ({
  apply: (context: { daemonBridge?: { start: () => void } }) => {
    context.daemonBridge = { start: runtimeMocks.bridgeStart };
  },
}));
vi.mock("@yishan-io/dsh-memory", () => ({ apply: runtimeMocks.installMemoryPlugin }));
vi.mock("@yishan-io/dsh-task", () => ({ apply: runtimeMocks.installTaskPlugin }));
vi.mock("@yishan-io/dsh-plugin-loader", () => ({
  apply: async (context: { yishanPluginLoader?: { states: readonly [] } }) => {
    await runtimeMocks.installPluginLoader();
    context.yishanPluginLoader = { states: [] };
  },
}));
vi.mock("@yishan-io/dsh-provider", () => ({ apply: runtimeMocks.installProviderPlugin }));
vi.mock("@yishan-io/dsh-workspace", () => ({ apply: vi.fn() }));
vi.mock("@yishan-io/dsh-session", () => ({ apply: vi.fn() }));
vi.mock("./corePlugins", () => ({ installCorePlugins: runtimeMocks.installCorePlugins }));

import { RuntimeHost } from "./host";

beforeEach(() => {
  runtimeMocks.dispose.mockReset().mockResolvedValue(undefined);
  runtimeMocks.installCorePlugins.mockReset().mockResolvedValue(undefined);
  runtimeMocks.installProviderPlugin.mockReset().mockResolvedValue(undefined);
  runtimeMocks.installMemoryPlugin.mockReset().mockResolvedValue(undefined);
  runtimeMocks.installTaskPlugin.mockReset().mockResolvedValue(undefined);
  runtimeMocks.installPluginLoader.mockReset().mockResolvedValue(undefined);
  runtimeMocks.bridgeStart.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("RuntimeHost", () => {
  it("starts the bridge only after runtime and managed plugins are installed", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-host-order-"));
    try {
      await RuntimeHost.create({ dataDirectory });
      expect(runtimeMocks.installTaskPlugin).toHaveBeenCalledOnce();
      expect(runtimeMocks.installMemoryPlugin).toHaveBeenCalledOnce();
      expect(runtimeMocks.bridgeStart).toHaveBeenCalledOnce();
      const taskOrder = runtimeMocks.installTaskPlugin.mock.invocationCallOrder[0];
      const memoryOrder = runtimeMocks.installMemoryPlugin.mock.invocationCallOrder[0];
      const pluginsOrder = runtimeMocks.installPluginLoader.mock.invocationCallOrder[0];
      const bridgeOrder = runtimeMocks.bridgeStart.mock.invocationCallOrder[0];
      if (
        taskOrder === undefined ||
        memoryOrder === undefined ||
        pluginsOrder === undefined ||
        bridgeOrder === undefined
      ) {
        throw new Error("startup calls were not recorded");
      }
      expect(taskOrder).toBeLessThan(memoryOrder);
      expect(memoryOrder).toBeLessThan(pluginsOrder);
      expect(pluginsOrder).toBeLessThan(bridgeOrder);
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });

  it("closes its context once when close is called repeatedly", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-host-close-"));
    try {
      const host = await RuntimeHost.create({ dataDirectory });
      await Promise.all([host.close(), host.close()]);
      await host.close();
      expect(runtimeMocks.dispose).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });

  it("cleans up the context when startup fails", async () => {
    const startupError = new Error("core plugin installation failed");
    runtimeMocks.installCorePlugins.mockRejectedValueOnce(startupError);
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-host-startup-"));
    try {
      await expect(RuntimeHost.create({ dataDirectory })).rejects.toBe(startupError);
      expect(runtimeMocks.dispose).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });

  it("reports both startup and cleanup failures", async () => {
    const startupError = new Error("core plugin installation failed");
    const cleanupError = new Error("cleanup failed");
    runtimeMocks.installCorePlugins.mockRejectedValueOnce(startupError);
    runtimeMocks.dispose.mockRejectedValueOnce(cleanupError);
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-host-startup-cleanup-"));
    try {
      await expect(RuntimeHost.create({ dataDirectory })).rejects.toMatchObject({
        errors: [startupError, cleanupError],
      });
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });
});

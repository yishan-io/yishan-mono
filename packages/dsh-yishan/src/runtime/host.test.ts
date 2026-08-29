import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  dispose: vi.fn<() => Promise<void>>(),
  installCore: vi.fn<() => Promise<void>>(),
  installProviders: vi.fn<() => Promise<void>>(),
  loadPlugins: vi.fn<() => Promise<{ states: readonly [] }>>(),
}));

vi.mock("@deepseek-ai/cordis", () => ({
  Context: class {
    fiber = { dispose: runtimeMocks.dispose };
    plugin = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  },
}));
vi.mock("./core", () => ({ installCoreServices: runtimeMocks.installCore }));
vi.mock("./providers", () => ({ installProviders: runtimeMocks.installProviders }));
vi.mock("./plugins", () => ({ loadPlugins: runtimeMocks.loadPlugins }));

import { RuntimeHost } from "./host";

beforeEach(() => {
  runtimeMocks.dispose.mockReset().mockResolvedValue(undefined);
  runtimeMocks.installCore.mockReset().mockResolvedValue(undefined);
  runtimeMocks.installProviders.mockReset().mockResolvedValue(undefined);
  runtimeMocks.loadPlugins.mockReset().mockResolvedValue({ states: [] });
});

afterEach(() => vi.restoreAllMocks());

describe("RuntimeHost", () => {
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
    const startupError = new Error("core installation failed");
    runtimeMocks.installCore.mockRejectedValueOnce(startupError);
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-host-startup-"));
    try {
      await expect(RuntimeHost.create({ dataDirectory })).rejects.toBe(startupError);
      expect(runtimeMocks.dispose).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });

  it("reports both startup and cleanup failures", async () => {
    const startupError = new Error("core installation failed");
    const cleanupError = new Error("cleanup failed");
    runtimeMocks.installCore.mockRejectedValueOnce(startupError);
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

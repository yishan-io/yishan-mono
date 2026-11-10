import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetChildExtensionCache, resolveChildExtensionFactories } from "./childExtensions";

describe("resolveChildExtensionFactories", () => {
  beforeEach(() => {
    resetChildExtensionCache();
    vi.doMock("@yishan-io/pi-task", () => ({}));
  });

  test("forwards the pi-lsp factory when the package is installed", async () => {
    vi.doMock("@yishan-io/pi-lsp", () => ({ createPiLspExtension: () => {} }));

    const factories = await resolveChildExtensionFactories();

    expect(factories).toHaveLength(1);
    expect(typeof factories[0]).toBe("function");
  });

  test("returns no factories when pi-lsp is installed without the factory", async () => {
    vi.doMock("@yishan-io/pi-lsp", () => ({ somethingElse: true }));

    const factories = await resolveChildExtensionFactories();

    expect(factories).toEqual([]);
  });

  test("returns no factories when pi-lsp is not installed", async () => {
    vi.doMock("@yishan-io/pi-lsp", () => {
      throw new Error("Cannot find module '@yishan-io/pi-lsp'");
    });

    const factories = await resolveChildExtensionFactories();

    expect(factories).toEqual([]);
  });
  test("forwards only the read-only Task factory and caches resolution", async () => {
    vi.doMock("@yishan-io/pi-lsp", () => ({}));
    const readFactory = vi.fn();
    const fullFactory = vi.fn();
    vi.doMock("@yishan-io/pi-task", () => ({
      createPiTaskReadExtension: readFactory,
      createPiTaskExtension: fullFactory,
    }));
    const factories = await resolveChildExtensionFactories();
    expect(factories).toHaveLength(1);
    const pi = { registerTool: vi.fn() };
    const factory = factories[0];
    if (!factory) throw new Error("Task read factory was not forwarded");
    await factory(pi as never);
    expect(readFactory).toHaveBeenCalledWith(pi);
    expect(fullFactory).not.toHaveBeenCalled();
    expect(await resolveChildExtensionFactories()).toEqual(factories);
  });

  test("keeps LSP when the optional Task package cannot load", async () => {
    vi.doMock("@yishan-io/pi-lsp", () => ({ createPiLspExtension: () => {} }));
    vi.doMock("@yishan-io/pi-task", () => {
      throw new Error("not installed");
    });
    expect(await resolveChildExtensionFactories()).toHaveLength(1);
  });

  test("does not fall back to the full Task factory on older installs", async () => {
    vi.doMock("@yishan-io/pi-lsp", () => ({}));
    vi.doMock("@yishan-io/pi-task", () => ({ createPiTaskExtension: vi.fn() }));
    expect(await resolveChildExtensionFactories()).toEqual([]);
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetChildExtensionCache, resolveChildExtensionFactories } from "./childExtensions";

describe("resolveChildExtensionFactories", () => {
  beforeEach(() => {
    resetChildExtensionCache();
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
});

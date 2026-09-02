import { describe, expect, it } from "vitest";

import { pluginEntrySchema, signedPluginSnapshotSchema } from "./schema";

describe("plugin manifest schemas", () => {
  it("applies data-only entry defaults", () => {
    expect(pluginEntrySchema.parse({ id: "main", entrypoint: "dist/index.js" })).toEqual({
      id: "main",
      entrypoint: "dist/index.js",
      config: {},
      disabled: false,
      inject: [],
    });
  });

  it("rejects escaping paths and dynamic Cordis config", () => {
    expect(() => pluginEntrySchema.parse({ id: "main", entrypoint: "../index.js" })).toThrow();
    expect(() =>
      pluginEntrySchema.parse({ id: "main", entrypoint: "index.js", config: { value: "{{ expression }}" } }),
    ).toThrow();
  });

  it("rejects unknown signed snapshot fields", () => {
    expect(() => signedPluginSnapshotSchema.parse({ version: 1, plugins: [], extra: true })).toThrow();
  });
});

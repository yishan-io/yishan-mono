import { describe, expect, it } from "vitest";

import { isDeveloperMode, resolveDataDirectory } from "./config";

describe("runtime configuration", () => {
  it("resolves an explicit data directory before the daemon environment directory", () => {
    expect(resolveDataDirectory({ dataDirectory: "relative-runtime-data" }, { YISHAN_DSH_DATA_DIR: "/env-data" })).toBe(
      `${process.cwd()}/relative-runtime-data`,
    );
  });

  it("uses the daemon data directory environment value when no explicit directory is configured", () => {
    expect(resolveDataDirectory({}, { YISHAN_DSH_DATA_DIR: "relative-environment-data" })).toBe(
      `${process.cwd()}/relative-environment-data`,
    );
  });

  it("enables Developer Mode only for the strict daemon environment value", () => {
    expect(isDeveloperMode({ YISHAN_DSH_DEVELOPER_MODE: "true" })).toBe(true);
    expect(isDeveloperMode({ YISHAN_DSH_DEVELOPER_MODE: "TRUE" })).toBe(false);
    expect(isDeveloperMode({ YISHAN_DSH_DEVELOPER_MODE: "1" })).toBe(false);
    expect(isDeveloperMode({})).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isDaemonVersionOutdated } from "./versionHelpers";

describe("isDaemonVersionOutdated", () => {
  it("returns true when daemon version is behind app version", () => {
    expect(isDaemonVersionOutdated({ daemonVersion: "0.1.0", appVersion: "0.2.0" })).toBe(true);
  });

  it("returns false when versions match", () => {
    expect(isDaemonVersionOutdated({ daemonVersion: "0.2.0", appVersion: "0.2.0" })).toBe(false);
  });

  it("returns false when daemon version is newer", () => {
    expect(isDaemonVersionOutdated({ daemonVersion: "0.3.0", appVersion: "0.2.0" })).toBe(false);
  });

  it("returns false when versions are missing or invalid", () => {
    expect(isDaemonVersionOutdated({ daemonVersion: "", appVersion: "0.2.0" })).toBe(false);
    expect(isDaemonVersionOutdated({ daemonVersion: "dev", appVersion: "0.2.0" })).toBe(false);
    expect(isDaemonVersionOutdated({ daemonVersion: "0.1.0", appVersion: "dev" })).toBe(false);
  });
});

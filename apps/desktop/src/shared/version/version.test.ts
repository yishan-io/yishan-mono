import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./version";

describe("isNewerVersion", () => {
  it("returns false when either version is missing", () => {
    expect(isNewerVersion(undefined, "1.2.3")).toBe(false);
    expect(isNewerVersion("1.2.3", undefined)).toBe(false);
    expect(isNewerVersion(undefined, undefined)).toBe(false);
  });

  it("detects a newer patch/minor/major", () => {
    expect(isNewerVersion("0.84.1", "0.85.0")).toBe(true);
    expect(isNewerVersion("0.84.1", "0.84.2")).toBe(true);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(true);
    expect(isNewerVersion("1.2.3", "2.0.0")).toBe(true);
  });

  it("returns false for equal or older latest", () => {
    expect(isNewerVersion("0.85.0", "0.85.0")).toBe(false);
    expect(isNewerVersion("0.85.0", "0.84.1")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("ignores prerelease/build suffixes for the numeric comparison", () => {
    expect(isNewerVersion("0.85.0-beta.1", "0.85.0")).toBe(false);
    expect(isNewerVersion("0.84.1", "0.85.0-rc.1")).toBe(true);
    expect(isNewerVersion("0.84.1+abc", "0.85.0")).toBe(true);
  });

  it("handles uneven segment counts", () => {
    expect(isNewerVersion("1.2", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.2", "1.3.0")).toBe(true);
  });
});

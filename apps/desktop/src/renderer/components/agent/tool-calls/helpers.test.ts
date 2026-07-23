import { describe, expect, it } from "vitest";
import { parseWorkspaceListCount } from "./helpers";

describe("parseWorkspaceListCount", () => {
  it("returns null for empty string", () => {
    expect(parseWorkspaceListCount("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseWorkspaceListCount("   \n  ")).toBeNull();
  });

  it("returns 0 for the no-workspaces plain-text response", () => {
    expect(parseWorkspaceListCount("No workspaces are currently open.")).toBe(0);
  });

  it("returns 0 for the no-workspaces response with a leading newline", () => {
    expect(parseWorkspaceListCount("\nNo workspaces are currently open.")).toBe(0);
  });

  it("returns the array length for a valid JSON workspace array", () => {
    const content = JSON.stringify([
      { id: "ws-1", path: "/tmp/ws1" },
      { id: "ws-2", path: "/tmp/ws2" },
      { id: "ws-3", path: "/tmp/ws3" },
    ]);
    expect(parseWorkspaceListCount(content)).toBe(3);
  });

  it("returns 0 for an empty JSON array", () => {
    expect(parseWorkspaceListCount("[]")).toBe(0);
  });

  it("returns null for valid JSON that is not an array", () => {
    expect(parseWorkspaceListCount('{"workspaces": []}')).toBeNull();
  });

  it("returns null for unparseable JSON that is not the no-workspaces message", () => {
    expect(parseWorkspaceListCount("failed to list workspaces: connection refused")).toBeNull();
  });
});

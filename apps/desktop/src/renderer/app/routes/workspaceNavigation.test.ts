import { describe, expect, it } from "vitest";
import {
  buildWorkspaceNavigationPath,
  buildWorkspaceSessionNavigationPath,
  buildWorkspaceTabNavigationPath,
  parseWorkspaceSessionNavigationPath,
} from "./workspaceNavigation";

describe("workspaceNavigation", () => {
  it("builds a workspace path with workspace and session query params", () => {
    expect(buildWorkspaceSessionNavigationPath("workspace-1", "session-1")).toBe(
      "/?workspaceId=workspace-1&sessionId=session-1",
    );
  });

  it("builds a workspace path with workspace query param only", () => {
    expect(buildWorkspaceNavigationPath("workspace-1")).toBe("/?workspaceId=workspace-1");
  });

  it("builds a workspace path with workspace and tab query params", () => {
    expect(buildWorkspaceTabNavigationPath("workspace-1", "tab-1")).toBe("/?workspaceId=workspace-1&tabId=tab-1");
  });

  it("parses workspace and session focus metadata from workspace paths", () => {
    expect(parseWorkspaceSessionNavigationPath("/?workspaceId=workspace-1&sessionId=session-1")).toEqual({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      tabId: undefined,
    });
    expect(parseWorkspaceSessionNavigationPath("/?workspaceId=workspace-1&tabId=tab-1")).toEqual({
      workspaceId: "workspace-1",
      tabId: "tab-1",
      sessionId: undefined,
    });
  });

  it("returns empty focus metadata for non-workspace paths or blank params", () => {
    expect(parseWorkspaceSessionNavigationPath("/repos?workspaceId=workspace-1&sessionId=session-1")).toEqual({});
    expect(parseWorkspaceSessionNavigationPath("/settings?workspaceId=workspace-1&sessionId=session-1")).toEqual({});
    expect(parseWorkspaceSessionNavigationPath("/?workspaceId=   &sessionId= ")).toEqual({});
  });
});

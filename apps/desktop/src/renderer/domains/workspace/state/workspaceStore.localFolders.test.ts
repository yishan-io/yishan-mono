// @vitest-environment jsdom
import { workbenchNavigationStore } from "@renderer/domains/workbench";
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { workspaceStore } from "./workspaceStore";

describe("workspaceStore runtime wiring", () => {
  beforeEach(() => {
    workbenchNavigationStore.setState({
      activeWorkspaceId: "",
      activeProjectId: "",
    });
    workspaceStore.setState({
      workspaces: [],
    });
  });

  it("has loadLocalFolders wired into the real store", () => {
    expect(typeof workspaceStore.getState().loadLocalFolders).toBe("function");
  });

  it("loadLocalFolders appends folder rows to workspaces[]", () => {
    workspaceStore.getState().loadLocalFolders([
      {
        id: "d2d3a7d4-11f3-47b8-805a-502630481b9f",
        path: "/Users/zhex/code/playground/relay-test",
        name: "relay-test",
      } as never,
    ]);
    const workspaces = workspaceStore.getState().workspaces;
    expect(workspaces.some((w) => w.id === "d2d3a7d4-11f3-47b8-805a-502630481b9f")).toBe(true);
    const folder = workspaces.find((w) => w.id === "d2d3a7d4-11f3-47b8-805a-502630481b9f");
    expect(folder?.kind).toBe("folder");
    expect(folder?.projectId).toBe("local-folder");
  });
});

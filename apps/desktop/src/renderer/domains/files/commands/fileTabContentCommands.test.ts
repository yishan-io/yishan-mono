import { tabStore } from "@renderer/domains/workbench";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileTabContentStore } from "../state/fileTabContentStore";
import { seedFileTabContent, updateFileTabContent } from "./fileTabContentCommands";

const initialFileTabContentState = fileTabContentStore.getState();
const initialTabState = tabStore.getState();

function setTemporaryFileTab(): void {
  tabStore.setState({
    tabs: [
      {
        id: "file-1",
        workspaceId: "workspace-1",
        title: "a.ts",
        pinned: false,
        kind: "file",
        data: { path: "src/a.ts", isDirty: false, isTemporary: true },
      },
    ],
    selectedTabId: "file-1",
  });
  seedFileTabContent({ tabId: "file-1", path: "src/a.ts", content: "a1" });
}

describe("fileTabContentCommands", () => {
  beforeEach(() => {
    fileTabContentStore.setState(initialFileTabContentState, true);
    tabStore.setState(initialTabState, true);
  });

  afterEach(() => {
    fileTabContentStore.setState(initialFileTabContentState, true);
    tabStore.setState(initialTabState, true);
  });

  it("promotes a temporary file tab when content is edited", () => {
    setTemporaryFileTab();

    updateFileTabContent("file-1", "a2");

    const tab = tabStore.getState().tabs[0];
    expect(tab?.kind === "file" ? tab.data.isDirty : undefined).toBe(true);
    expect(tab?.kind === "file" ? tab.data.isTemporary : undefined).toBe(false);
  });

  it("keeps a temporary file tab temporary when content is unchanged", () => {
    setTemporaryFileTab();

    updateFileTabContent("file-1", "a1");

    const tab = tabStore.getState().tabs[0];
    expect(tab?.kind === "file" ? tab.data.isDirty : undefined).toBe(false);
    expect(tab?.kind === "file" ? tab.data.isTemporary : undefined).toBe(true);
  });
});

// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { ACTIONS } from "../../shared/contracts/actions";
import { SUPPORTED_KEY_BINDINGS } from "./keybindings";

vi.mock("@renderer/domains/browser", () => ({ reloadWebview: vi.fn() }));

describe("SUPPORTED_KEY_BINDINGS", () => {
  it("documents delete-selected-file-tree-entry as delete/backspace on both platforms", () => {
    const deleteBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === ACTIONS.FILE_DELETE);
    expect(deleteBinding).toBeTruthy();

    expect(deleteBinding?.macKeys).toEqual(["⌘", "DELETE/BACKSPACE"]);
    expect(deleteBinding?.windowsKeys).toEqual(["CTRL", "DELETE/BACKSPACE"]);
  });

  it("documents undo-file-tree-operation as mod+z on both platforms", () => {
    const undoBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === ACTIONS.FILE_UNDO);
    expect(undoBinding).toBeTruthy();

    expect(undoBinding?.macKeys).toEqual(["⌘", "Z"]);
    expect(undoBinding?.windowsKeys).toEqual(["CTRL", "Z"]);
  });

  it("documents select-tab-by-index as 1-9 range on both platforms", () => {
    const selectByIndexBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "select-tab-by-index");
    expect(selectByIndexBinding).toBeTruthy();

    expect(selectByIndexBinding?.macKeys).toEqual(["⌘", "1-9"]);
    expect(selectByIndexBinding?.windowsKeys).toEqual(["CTRL", "1-9"]);
  });

  it("documents left pane toggle as mod+b", () => {
    const leftPaneBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "toggle-left-pane");

    expect(leftPaneBinding?.macKeys).toEqual(["⌘", "B"]);
    expect(leftPaneBinding?.windowsKeys).toEqual(["CTRL", "B"]);
  });

  it("documents chat, agent-chat, and terminal tabs", () => {
    const chatBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "new-tab");
    const agentChatBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "open-agent-chat");
    const terminalBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "open-terminal");
    const browserBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "open-browser");
    const focusAgentChatComposerBinding = SUPPORTED_KEY_BINDINGS.find(
      (binding) => binding.id === "focus-agent-chat-composer",
    );

    expect(chatBinding?.macKeys).toEqual(["⌘", "Y"]);
    expect(chatBinding?.windowsKeys).toEqual(["CTRL", "Y"]);
    expect(agentChatBinding?.macKeys).toEqual(["⌘", "⇧", "A"]);
    expect(agentChatBinding?.windowsKeys).toEqual(["CTRL", "⇧", "A"]);
    expect(terminalBinding?.macKeys).toEqual(["⌘", "T"]);
    expect(terminalBinding?.windowsKeys).toEqual(["CTRL", "T"]);
    expect(browserBinding?.macKeys).toEqual(["⌘", "⇧", "B"]);
    expect(browserBinding?.windowsKeys).toEqual(["CTRL", "⇧", "B"]);
    expect(focusAgentChatComposerBinding?.macKeys).toEqual(["⌘", "L"]);
    expect(focusAgentChatComposerBinding?.windowsKeys).toEqual(["CTRL", "L"]);
  });

  it("documents close-selected-workspace as mod+shift+w", () => {
    const closeWorkspaceBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "close-selected-workspace");

    expect(closeWorkspaceBinding?.macKeys).toEqual(["⌘", "⇧", "W"]);
    expect(closeWorkspaceBinding?.windowsKeys).toEqual(["CTRL", "⇧", "W"]);
  });

  it("documents create-workspace as mod+n", () => {
    const createWorkspaceBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "create-workspace");

    expect(createWorkspaceBinding?.macKeys).toEqual(["⌘", "N"]);
    expect(createWorkspaceBinding?.windowsKeys).toEqual(["CTRL", "N"]);
  });

  it("documents open-selected-file-in-external-app as mod+o", () => {
    const openFileBinding = SUPPORTED_KEY_BINDINGS.find(
      (binding) => binding.id === ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP,
    );

    expect(openFileBinding?.macKeys).toEqual(["⌘", "O"]);
    expect(openFileBinding?.windowsKeys).toEqual(["CTRL", "O"]);
  });

  it("documents reload-browser-tab as mod+r", () => {
    const reloadBinding = SUPPORTED_KEY_BINDINGS.find((binding) => binding.id === "reload-browser-tab");

    expect(reloadBinding?.macKeys).toEqual(["⌘", "R"]);
    expect(reloadBinding?.windowsKeys).toEqual(["CTRL", "R"]);
  });
});

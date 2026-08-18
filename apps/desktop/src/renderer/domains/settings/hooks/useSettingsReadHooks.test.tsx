// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { keybindingSettingsStore } from "../state/keybindingSettingsStore";
import { workspaceSettingsStore } from "../state/workspaceSettingsStore";
import { useKeybindingOverrides, useWorkspaceBranchPrefixSettings } from "./useSettingsReadHooks";

const initialWorkspaceSettingsState = workspaceSettingsStore.getState();
const initialKeybindingSettingsState = keybindingSettingsStore.getState();

afterEach(() => {
  workspaceSettingsStore.setState(initialWorkspaceSettingsState, true);
  keybindingSettingsStore.setState(initialKeybindingSettingsState, true);
});

describe("useSettingsReadHooks — Settings state read hooks (Phase 17)", () => {
  it("useWorkspaceBranchPrefixSettings subscribes to prefix settings", () => {
    workspaceSettingsStore.setState({ prefixMode: "custom", customPrefix: "ys" });

    const { result } = renderHook(() => useWorkspaceBranchPrefixSettings());

    expect(result.current).toEqual({ prefixMode: "custom", customPrefix: "ys" });
  });

  it("useKeybindingOverrides subscribes to overrides", () => {
    keybindingSettingsStore.setState({ overridesById: { "focus-agent-chat-composer": ["Cmd+K"] } } as never);

    const { result } = renderHook(() => useKeybindingOverrides());

    expect(result.current["focus-agent-chat-composer"]).toEqual(["Cmd+K"]);
  });
});

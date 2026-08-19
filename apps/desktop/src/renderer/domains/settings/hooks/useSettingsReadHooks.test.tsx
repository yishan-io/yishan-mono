// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { keybindingSettingsStore } from "../state/keybindingSettingsStore";
import { useKeybindingOverrides } from "./useSettingsReadHooks";

const initialKeybindingSettingsState = keybindingSettingsStore.getState();

afterEach(() => {
  keybindingSettingsStore.setState(initialKeybindingSettingsState, true);
});

describe("useSettingsReadHooks — Settings state read hooks (Phase 17)", () => {
  it("useKeybindingOverrides subscribes to overrides", () => {
    keybindingSettingsStore.setState({ overridesById: { "focus-agent-chat-composer": ["Cmd+K"] } } as never);

    const { result } = renderHook(() => useKeybindingOverrides());

    expect(result.current["focus-agent-chat-composer"]).toEqual(["Cmd+K"]);
  });
});

// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { terminalFocusStore } from "../state/terminalFocusStore";
import { useHasPendingTerminalFocus } from "./useTerminalReadHooks";

const initialTerminalFocusState = terminalFocusStore.getState();

afterEach(() => {
  terminalFocusStore.setState(initialTerminalFocusState, true);
});

describe("useTerminalReadHooks — Terminal state read hooks (Phase 17)", () => {
  it("useHasPendingTerminalFocus reflects pending focus requests", () => {
    terminalFocusStore.getState().requestFocus("tab-1");

    const { result } = renderHook(() => useHasPendingTerminalFocus("tab-1"));

    expect(result.current).toBe(true);
    expect(renderHook(() => useHasPendingTerminalFocus("tab-2")).result.current).toBe(false);
  });
});

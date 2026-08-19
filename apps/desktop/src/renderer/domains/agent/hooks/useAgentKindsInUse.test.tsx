// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { agentSettingsStore } from "../state/agentSettingsStore";
import { useAgentKindsInUse } from "./useAgentKindsInUse";

const initialAgentSettingsState = agentSettingsStore.getState();

afterEach(() => {
  agentSettingsStore.setState(initialAgentSettingsState, true);
});

describe("useAgentKindsInUse — Agent enablement read hook (desktop7 Phase 21)", () => {
  it("subscribes to the agent kinds map", () => {
    agentSettingsStore.setState({ inUseByAgentKind: { opencode: true } } as never);

    const { result } = renderHook(() => useAgentKindsInUse());

    expect(result.current.opencode).toBe(true);
  });
});

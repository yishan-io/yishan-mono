import { afterEach, describe, expect, it } from "vitest";
import { agentChatStore } from "../state/agentChatStore";
import { selectAgentChatSession } from "./agentChatSelectors";

const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
});

describe("agentChatSelectors — Agent chat state public read surface (Phase 17)", () => {
  it("selectAgentChatSession reads one session non-reactively", () => {
    agentChatStore.setState({
      sessionsByTabId: {
        "tab-1": { sessionId: "session-1" },
      },
    } as never);

    expect(selectAgentChatSession("tab-1")?.sessionId).toBe("session-1");
    expect(selectAgentChatSession("missing")).toBeUndefined();
  });
});

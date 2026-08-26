// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../../../state/agentChatStore";
import { AgentChatView } from "./AgentChatView";

const mocks = vi.hoisted(() => ({
  retryDSHTranscript: vi.fn(),
  setAgentChatStreamTabVisible: vi.fn(),
  startAgentChatSession: vi.fn(),
}));

vi.mock("../../../commands/agentChatCommands", () => ({
  respondToAgentExtensionUiRequest: vi.fn(),
  retryDSHTranscript: mocks.retryDSHTranscript,
  startAgentChatSession: mocks.startAgentChatSession,
}));

vi.mock("../../../subscriptions/agentChatPiEventShared", () => ({
  setAgentChatStreamTabVisible: mocks.setAgentChatStreamTabVisible,
}));

vi.mock("@renderer/domains/workbench", () => ({
  tabStore: <T,>(selector: (state: { tabs: [] }) => T): T => selector({ tabs: [] }),
}));

vi.mock("./useAgentChatSessionLifecycle", () => ({
  useAgentChatSessionLifecycle: () => undefined,
}));

vi.mock("./AgentChatContentLayout", () => ({
  AgentChatContentLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./AgentChatTranscriptPane", () => ({
  MemoizedAgentChatTranscriptPane: () => <div data-testid="agent-chat-transcript" />,
}));

vi.mock("./AgentChatComposerPane", () => ({
  AgentChatComposerPane: () => <div data-testid="agent-chat-composer" />,
}));

vi.mock("./AgentPendingUiPrompt", () => ({
  AgentPendingUiPrompt: () => <div data-testid="agent-pending-ui-prompt" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function seedErroredSession({ isRetryAvailable }: { isRetryAvailable: boolean }): void {
  const store = agentChatStore.getState();
  store.initSession("tab-1", "session-1");
  store.setSessionError("tab-1", "DSH durable reload failed: offline");
  store.setDSHTranscriptRetryAvailable("tab-1", isRetryAvailable);
}

afterEach(() => {
  cleanup();
  agentChatStore.getState().removeSession("tab-1");
  vi.clearAllMocks();
});

describe("AgentChatView DSH transcript retry", () => {
  it("retries only a failed DSH transcript without starting another runtime", async () => {
    seedErroredSession({ isRetryAvailable: true });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" runtime="dsh" isActive />);

    fireEvent.click(screen.getByRole("button", { name: "Retry DSH transcript" }));

    await waitFor(() => expect(mocks.retryDSHTranscript).toHaveBeenCalledWith("tab-1"));
    expect(mocks.startAgentChatSession).not.toHaveBeenCalled();
  });

  it("does not show a DSH retry action without a durable transcript", () => {
    seedErroredSession({ isRetryAvailable: false });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" runtime="dsh" isActive />);

    expect(screen.queryByRole("button", { name: "Retry DSH transcript" })).toBeNull();
  });

  it("does not show a DSH retry action for Pi errors", () => {
    seedErroredSession({ isRetryAvailable: true });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" runtime="pi" isActive />);

    expect(screen.queryByRole("button", { name: "Retry DSH transcript" })).toBeNull();
  });
});

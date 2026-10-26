// @vitest-environment jsdom
import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../../chat/agentChatTypes";
import { agentChatStore } from "../../../state/agentChatStore";
import { normalizeIncomingAgentMessage } from "../../../subscriptions/agentChatInboundMessage";
import { MemoizedAgentChatTranscriptPane as TranscriptPane } from "../chat/AgentChatTranscriptPane";

const navigation = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../commands/agentChatSubagentCommands", () => ({
  openSubagentSessionInRightSplitPane: navigation.open,
}));
// Geometry is outside this integration: mount every real model row deterministically.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: getItemKey(index),
        start: index * 180,
      })),
    getTotalSize: () => count * 180,
    measureElement: vi.fn(),
  }),
}));

const PARENT_TAB = "model-parent";
let parentSessionId = "";
let sessionSequence = 0;
const store = () => agentChatStore.getState();
function getSession(tabId = PARENT_TAB) {
  const session = store().sessionsByTabId[tabId];
  if (!session) throw new Error(`Missing test session: ${tabId}`);
  return session;
}
function renderPane(tabId = PARENT_TAB, isDetail = false) {
  return renderWithAppTheme(
    <TranscriptPane
      tabId={tabId}
      workspaceId="workspace"
      cwd="/project"
      paneId="left"
      isActive
      isReadOnlySubagentDetail={isDetail}
      parentSessionId={isDetail ? parentSessionId : undefined}
    />,
  );
}
function createReadOwner(id: string): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "toolCall", id: `${id}-call`, name: "read", arguments: { path: `${id}.ts` } }],
  };
}
function createChildEvent(event: "started" | "completed"): AgentMessage {
  return {
    id: `child-${event}`,
    role: "custom",
    customType: "pi-subagent-child",
    display: false,
    content: "",
    timestamp: event === "started" ? 100 : 200,
    details: {
      event,
      childSessionId: "actual-child",
      parentToolCallId: "delegate-call",
      agentId: "actual-agent",
      agentName: "reader",
      ...(event === "completed" ? { status: "completed" } : {}),
    },
  };
}
function expectBefore(first: HTMLElement, second: HTMLElement) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

beforeAll(async () => {
  const { initI18n, i18n } = await import("@renderer/i18n");
  await initI18n();
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  vi.clearAllMocks();
  parentSessionId = `model-parent-session-${++sessionSequence}`;
  agentChatStore.setState({ sessionsByTabId: {} });
  store().initSession(PARENT_TAB, parentSessionId);
});
afterEach(() => {
  cleanup();
  agentChatStore.setState({ sessionsByTabId: {} });
});

describe("real store → transcript Pane → model rows", () => {
  it("preserves user time and thinking/tool/text reading order through group disclosure", () => {
    const timestamp = new Date(2025, 0, 2, 13, 45).getTime();
    store().appendMessage(PARENT_TAB, { id: "order-user", role: "user", content: "Inspect the source", timestamp });
    store().setSessionState(PARENT_TAB, "running");
    store().setTurnActive(PARENT_TAB, true);
    store().updateStreamingMessage(PARENT_TAB, {
      id: "order-owner",
      role: "assistant",
      content: [
        { type: "text", text: "Before the inspection" },
        { type: "thinking", thinking: "Inspect dependencies first" },
        { type: "toolCall", id: "order-call", name: "read", arguments: { path: "ordered.ts" } },
        { type: "text", text: "After the inspection" },
      ],
    });
    renderPane();
    const user = screen.getByTestId("user-message-row");
    expect(
      within(user).getByText(
        new Date(timestamp).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand tool calls" }));
    const group = screen.getByTestId("agent-tool-call-group-body");
    expect(within(group).getByText("Thinking")).toBeTruthy();
    expectBefore(user, screen.getByText("Before the inspection"));
    expectBefore(screen.getByText("Before the inspection"), group);
    expectBefore(within(group).getByText("Inspect dependencies first"), within(group).getByText("ordered.ts"));
    expectBefore(group, screen.getByText("After the inspection"));
  });

  it("updates a live executing card to result content and authoritative replacement history", () => {
    const owner = createReadOwner("live-owner");
    store().setSessionState(PARENT_TAB, "running");
    store().setTurnActive(PARENT_TAB, true);
    store().updateStreamingMessage(PARENT_TAB, owner);
    store().applyToolExecution(PARENT_TAB, { callId: "live-owner-call", name: "read", state: "running" });
    renderPane();
    expect(screen.getByTestId("agent-tool-call-group-live")).toBeTruthy();
    expect(screen.getByText("live-owner.ts")).toBeTruthy();
    act(() => {
      store().finalizeStreamingMessage(PARENT_TAB);
      store().appendMessage(PARENT_TAB, {
        id: "live-result",
        role: "toolResult",
        toolCallId: "live-owner-call",
        toolName: "read",
        content: "Live file contents",
      });
      store().applyToolExecution(PARENT_TAB, { callId: "live-owner-call", name: "read", state: "succeeded" });
      store().setTurnActive(PARENT_TAB, false);
      store().setSessionState(PARENT_TAB, "idle");
    });
    expect(screen.queryByTestId("agent-tool-call-group-live")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand tool calls" }));
    fireEvent.click(screen.getByText("live-owner.ts"));
    expect(screen.getByText("Live file contents")).toBeTruthy();
    act(() =>
      store().replaceMessages(PARENT_TAB, [
        owner,
        {
          id: "live-result",
          role: "toolResult",
          toolCallId: "live-owner-call",
          toolName: "read",
          content: "History file contents",
        },
      ]),
    );
    expect(screen.getByText("History file contents")).toBeTruthy();
    expect(screen.queryByText("Live file contents")).toBeNull();
    expect(screen.getAllByTestId("agent-turn")).toHaveLength(1);
    expect(screen.getAllByTestId("agent-tool-call-group")).toHaveLength(1);
  });

  it("does not manufacture a turn for an error-only assistant", () => {
    store().replaceMessages(PARENT_TAB, [
      { id: "error-user", role: "user", content: "Keep this prompt" },
      { id: "error-only", role: "assistant", content: [], stopReason: "error", errorMessage: "Provider unavailable" },
    ]);
    store().setSessionState(PARENT_TAB, "idle");
    renderPane();
    expect(screen.getByText("Keep this prompt")).toBeTruthy();
    expect(screen.queryByTestId("agent-turn")).toBeNull();
    expect(screen.queryByText("Provider unavailable")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("keeps no-ID and ownerless bodies readable, including missing state and content", () => {
    const missingContent = normalizeIncomingAgentMessage({
      id: "missing-content",
      role: "toolResult",
      toolCallId: "missing-call",
      toolName: "read",
    });
    if (!missingContent) throw new Error("Expected normalized tool result");
    store().replaceMessages(PARENT_TAB, [
      { id: "no-call", role: "toolResult", toolName: "bash", content: "No call ID body", isError: true },
      { id: "ownerless", role: "toolResult", toolCallId: "unowned-call", toolName: "read", content: "Ownerless body" },
      missingContent,
    ]);
    // A lifecycle record without an outcome has neither result content nor execution state.
    store().appendMessage(PARENT_TAB, {
      id: "unknown-child",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: {
        event: "completed",
        childSessionId: "unknown-child",
        parentToolCallId: "unknown-call",
        agentId: "unknown-agent",
        agentName: "Unknown agent",
      },
    });
    store().setSessionState(PARENT_TAB, "idle");
    renderPane();
    expect(screen.getByText("No call ID body")).toBeTruthy();
    expect(screen.getByText("Ownerless body")).toBeTruthy();
    // Pi toolResult itself supplies terminal success, regardless of content availability.
    expect(screen.getAllByText(/read.*succeeded/)).toHaveLength(2);
    expect(screen.getByText(/tool.*unknown/)).toBeTruthy();
    expect(screen.queryByTestId("agent-turn")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("distinguishes background acceptance from completion and navigates only to the real terminal child", async () => {
    store().appendMessage(PARENT_TAB, {
      id: "delegate-owner",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "delegate-call",
          name: "Agent",
          arguments: { agent: "reader", prompt: "Inspect sources" },
        },
      ],
    });
    store().appendMessage(PARENT_TAB, {
      id: "dispatch-result",
      role: "toolResult",
      toolCallId: "delegate-call",
      toolName: "Agent",
      content: "Accepted sessionId=fake-child",
      details: { mode: "background", agentId: "actual-agent" },
    });
    renderPane();
    fireEvent.click(screen.getByRole("button", { name: "Expand tool calls" }));
    expect(screen.getByText("queued")).toBeTruthy();
    expect(screen.queryByText("completed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open sub-agent reader" })).toBeNull();
    act(() => store().appendMessage(PARENT_TAB, createChildEvent("started")));
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open sub-agent reader" })).toBeNull();
    act(() => store().appendMessage(PARENT_TAB, createChildEvent("completed")));
    expect(screen.getByText("completed")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Open sub-agent reader" })));
    expect(navigation.open).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "workspace",
      cwd: "/project",
      parentPaneId: "left",
      parentSessionId: parentSessionId,
      childSessionId: "actual-child",
      agentId: "actual-agent",
      title: "reader",
    });
  });

  it("renders owned child snapshots, footer usage and terminal updates without leaking foreign ownership", () => {
    store().initSession("detail", "actual-child");
    store().initSession("foreign", "actual-child");
    const targets = [
      {
        tabId: "detail",
        childSessionId: "actual-child",
        sessionView: "subagent-detail",
        subagentParentSessionId: parentSessionId,
      },
      {
        tabId: "foreign",
        childSessionId: "actual-child",
        sessionView: "subagent-detail",
        subagentParentSessionId: "other-parent",
      },
    ];
    const childOwner = createReadOwner("child-owner");
    store().setSubagentLiveTranscripts(
      PARENT_TAB,
      { "actual-child": [childOwner] },
      {
        detailTargets: targets,
        metadata: {
          "actual-child": {
            status: "running",
            model: { id: "child-model", name: "Child Model", contextWindow: 8000 },
            thinkingLevel: "high",
            coverage: { completeness: "unknown", omittedMessages: 0, reasons: [] },
          },
        },
      },
    );
    const view = renderPane("foreign", true);
    expect(screen.queryByText("child-owner.ts")).toBeNull();
    expect(screen.queryByTestId("agent-turn")).toBeNull();
    expect(getSession("foreign").hasLoadedMessages).toBe(false);
    view.unmount();
    renderPane("detail", true);
    expect(screen.getByText("child-owner.ts")).toBeTruthy();
    expect(screen.getByTestId("agent-tool-call-group-live")).toBeTruthy();
    expect(screen.getByText("Model: Child Model")).toBeTruthy();
    expect(screen.getByText("Context: Context unavailable")).toBeTruthy();
    act(() => {
      store().setSubagentLiveTranscripts(PARENT_TAB, {
        "actual-child": [
          childOwner,
          {
            id: "child-output",
            role: "toolResult",
            toolCallId: "child-owner-call",
            toolName: "read",
            content: "Child output",
          },
          {
            id: "child-answer",
            role: "assistant",
            content: "Child final answer",
            usage: { input: 1000, output: 200, totalTokens: 1200 },
          },
        ],
      });
      store().appendMessage(PARENT_TAB, createChildEvent("completed"));
    });
    expect(screen.getByText("Child final answer")).toBeTruthy();
    expect(screen.getByText("Context: 1.2K / 8K tokens")).toBeTruthy();
    expect(screen.queryByTestId("agent-tool-call-group-live")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand tool calls" }));
    fireEvent.click(screen.getByText("child-owner.ts"));
    expect(screen.getByText("Child output")).toBeTruthy();
    expect(getSession("foreign").hasLoadedMessages).toBe(false);
    expect(getSession("detail").presentation).toBe(getSession().subagentSnapshots["actual-child"]?.presentation);
  });
});

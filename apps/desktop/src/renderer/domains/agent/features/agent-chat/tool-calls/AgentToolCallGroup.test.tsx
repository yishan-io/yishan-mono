import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { GroupDisplay, ToolCardModel } from "../../../chat/transcript/presentation.types";
import { AgentToolCallGroup, buildLiveHeaderGradient } from "./AgentToolCallGroup";
beforeAll(async () => {
  const { initI18n, i18n } = await import("@renderer/i18n");
  await initI18n();
  await i18n.changeLanguage("en");
});
afterEach(cleanup);
const card: ToolCardModel = {
  kind: "card",
  sessionId: "s",
  callId: "c",
  toolCall: { id: "c", name: "custom", arguments: {} },
  rendererKind: "generic",
  renderer: { kind: "generic" },
  result: { text: "Available result", isError: false },
  executionState: "succeeded",
  presentationState: "succeeded",
  isError: false,
  hasResult: true,
  completeness: "complete",
  isPending: false,
  isLive: false,
  agentStatus: null,
};
const group: GroupDisplay = {
  kind: "group",
  id: "g",
  members: [card],
  pendingMembers: [card],
  summaryItems: [{ key: "read", count: 7 }],
  callCount: 1,
  isLive: true,
};
describe("display group", () => {
  it("uses explicit pending members and summary even when card facts disagree", () => {
    renderWithAppTheme(<AgentToolCallGroup group={group} showRunningBlocks />);
    expect(screen.getByText(/7/)).toBeTruthy();
    expect(screen.getByTestId("agent-tool-call-group-live")).toBeTruthy();
    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));
    expect(screen.getByTestId("agent-tool-call-group-body")).toBeTruthy();
  });
  it("does not invent pending members from a running card", () => {
    renderWithAppTheme(
      <AgentToolCallGroup group={{ ...group, id: "no-pending", pendingMembers: [] }} showRunningBlocks />,
    );
    expect(screen.queryByTestId("agent-tool-call-group-live")).toBeNull();
  });
  it("gates pending content on owning turn and handles empty groups", () => {
    const view = renderWithAppTheme(<AgentToolCallGroup group={{ ...group, id: "done" }} showRunningBlocks={false} />);
    expect(screen.queryByTestId("agent-tool-call-group-live")).toBeNull();
    view.rerender(<AgentToolCallGroup group={{ ...group, members: [] }} showRunningBlocks />);
    expect(screen.queryByTestId("agent-tool-call-group")).toBeNull();
    expect(buildLiveHeaderGradient("primary")).toContain("primary");
  });
});

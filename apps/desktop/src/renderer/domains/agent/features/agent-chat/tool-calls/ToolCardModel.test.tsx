// @vitest-environment jsdom
import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectToolCard } from "../../../chat/transcript/presentation";
import type { ToolCallEntity, ToolCallSource } from "../../../chat/transcript/toolCalls.types";
import { AgentToolCallCard } from "./AgentToolCallCard";
import { AgentToolCallGroup } from "./AgentToolCallGroup";
import { projectToolCardFixture } from "./__tests__/toolCardFixtures";
import { extractResultText } from "./diff";

const source: ToolCallSource = { id: "fact", origin: "live", isFinal: true, priority: 1 };
function entity(name: string, args: Record<string, unknown> = {}): ToolCallEntity {
  return { sessionId: "s", callId: "c", executionState: "unknown", owner: { name, arguments: args, source } };
}
afterEach(cleanup);

describe("model dispatcher slice A", () => {
  it("uses projected result text/details/error without interpreting protocol content", () => {
    const call: ToolCallEntity = {
      ...entity("future", { command: "not bash" }),
      executionState: "failed",
      result: {
        source,
        outcome: "failed",
        content: {
          availability: "available",
          completeness: "complete",
          text: "plain failure",
          details: { reason: "denied" },
        },
      },
    };
    const before = structuredClone(call);
    const model = projectToolCard(call);
    expect(extractResultText(model.result)).toBe("plain failure");
    expect(model.result).toEqual({ text: "plain failure", details: { reason: "denied" }, isError: true });
    renderWithAppTheme(<AgentToolCallCard {...model} />);
    fireEvent.click(screen.getByText("future"));
    expect(screen.getByText("plain failure")).toBeTruthy();
    expect(call).toEqual(before);
  });

  it.each(["bash", "read", "edit", "Agent", "grep", "memory_search", "web_fetch"])(
    "keeps missing required %s fields visible through generic fallback",
    (name) => {
      renderWithAppTheme(<AgentToolCallCard {...projectToolCard(entity(name))} />);
      expect(screen.getByText("arguments")).toBeTruthy();
    },
  );

  it("uses renderer.kind rather than reselecting from the tool name", () => {
    const model = projectToolCard(entity("bash", { command: "echo hello" }));
    renderWithAppTheme(<AgentToolCallCard {...model} renderer={{ kind: "generic" }} />);
    expect(screen.getByText("arguments")).toBeTruthy();
  });
});

describe("model Agent slice B", () => {
  const agent = () => entity("Agent", { agent: "builder", prompt: "Implement panel" });
  it("keeps canonical running ahead of completed dispatch details and validates prompt separately", () => {
    const model = projectToolCard({
      ...agent(),
      executionState: "succeeded",
      children: new Map([
        [
          "child",
          {
            childSessionId: "child",
            event: "started",
            state: "running",
            isComplete: false,
            source,
          },
        ],
      ]),
      result: {
        source,
        content: {
          availability: "available",
          completeness: "complete",
          text: "dispatched",
          details: { status: "completed", sessionId: "fake-child" },
        },
      },
    });
    const before = structuredClone(model);
    renderWithAppTheme(<AgentToolCallCard {...model} toolCall={{ ...model.toolCall, arguments: {} }} />);
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByText("Implement panel")).toBeTruthy();
    expect(screen.queryByText("completed")).toBeNull();
    expect(screen.queryByRole("button", { name: /Open sub-agent/ })).toBeNull();
    expect(model).toEqual(before);
  });
  it.each(["unknown", "queued", "preparing"] as const)("projects the %s display label", (label) => {
    const call = agent();
    const model = projectToolCard({
      ...call,
      owner: call.owner
        ? { ...call.owner, source: { ...source, origin: label === "preparing" ? "live" : "snapshot" } }
        : undefined,
      ...(label === "queued" ? { dispatchState: "accepted" as const } : {}),
    });
    renderWithAppTheme(<AgentToolCallCard {...model} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(model.agentStatus).toBe(label === "queued" ? "pending" : "unknown");
    expect(model.isLive).toBe(false);
  });
  it.each([
    ["succeeded", "completed"],
    ["failed", "failed"],
    ["interrupted", "cancelled"],
  ] as const)("opens real terminal %s child without reading result sessionId", (state, label) => {
    const model = projectToolCard({
      ...agent(),
      children: new Map([
        [
          "child",
          {
            childSessionId: "child",
            event: "completed",
            state,
            isComplete: true,
            source,
          },
        ],
      ]),
    });
    const onOpen = vi.fn();
    renderWithAppTheme(<AgentToolCallCard {...model} onOpenCompletedSubagent={onOpen} />);
    expect(screen.getByText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open sub-agent builder" }));
    expect(onOpen).toHaveBeenCalledWith(model.navigationTarget);
  });
});

describe("legacy Agent background lifecycle priority", () => {
  it.each([
    ["running", undefined, "running"],
    ["completed", undefined, "completed"],
    ["running", "completed", "completed"],
    ["completed", "completed", "completed"],
    ["running", "failed", "failed"],
    ["completed", "failed", "failed"],
    ["running", "cancelled", "cancelled"],
    ["completed", "cancelled", "cancelled"],
  ] as const)("preserves %s with background status %s as %s through bridge and Group", (lifecycle, status, label) => {
    const input = {
      toolCall: {
        type: "toolCall" as const,
        id: "background-agent",
        name: "Agent",
        arguments: {
          agent: "builder",
          prompt: "Implement panel",
        },
      },
      result: {
        id: "accepted",
        role: "toolResult" as const,
        content: "accepted",
        details: {
          mode: "background",
          ...(status ? { status } : {}),
        },
      },
      agentLifecycleState: lifecycle,
    };
    const before = structuredClone(input);
    const model = projectToolCardFixture(input);
    expect(model.agentStatusLabel).toBe(label);
    expect(model.navigationTarget).toBeUndefined();
    expect(model.isLive).toBe(label === "running");
    renderWithAppTheme(
      <AgentToolCallGroup
        group={{
          kind: "group",
          id: `background-${lifecycle}-${status}`,
          members: [model],
          pendingMembers: model.isPending ? [model] : [],
          summaryItems: [],
          callCount: 1,
          isLive: model.isLive,
        }}
        showRunningBlocks
      />,
    );
    if (label === "running") expect(screen.getByText("running")).toBeTruthy();
    fireEvent.click(screen.getByTestId("agent-tool-call-group-header"));
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("queued")).toBeNull();
    expect(screen.queryByRole("button", { name: /Open sub-agent/ })).toBeNull();
    expect(input).toEqual(before);
  });
});

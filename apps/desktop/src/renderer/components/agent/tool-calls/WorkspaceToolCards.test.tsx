// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../../store/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

afterEach(() => {
  cleanup();
});

describe("AgentToolCallCard — workspace tools", () => {
  it("shows workspace_list label without a badge when result is not yet available", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ws-list-pending",
      name: "workspace_list",
      arguments: {},
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("list workspaces")).toBeTruthy();
    expect(screen.queryByText(/workspace/)).not.toBeNull();
    // count badge must not appear before result is received
    expect(screen.queryByText(/\d+ workspace/)).toBeNull();
    expect(screen.queryByText("no workspaces")).toBeNull();
  });

  it("shows workspace_list with count from result", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ws-list",
      name: "workspace_list",
      arguments: {},
    };

    const result = {
      id: "result-ws-list",
      role: "toolResult",
      toolCallId: "tool-ws-list",
      toolName: "workspace_list",
      content: JSON.stringify([
        { id: "ws-1", path: "/tmp/ws1" },
        { id: "ws-2", path: "/tmp/ws2" },
      ]),
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("list workspaces")).toBeTruthy();
    expect(screen.getByText("2 workspaces")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
  });

  it("shows workspace_list with zero count when no workspaces open", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ws-list-empty",
      name: "workspace_list",
      arguments: {},
    };

    const result = {
      id: "result-ws-list-empty",
      role: "toolResult",
      toolCallId: "tool-ws-list-empty",
      toolName: "workspace_list",
      content: "No workspaces are currently open.",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("no workspaces")).toBeTruthy();
  });

  it("shows workspace_find with the workspace id", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ws-find",
      name: "workspace_find",
      arguments: { workspaceId: "ws-abc123" },
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("ws-abc123")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
  });

  it("shows workspace_create with branch name and optional agent kind badge", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ws-create",
      name: "workspace_create",
      arguments: {
        branch: "feature/new-dashboard",
        taskRunAgentKind: "builder",
      },
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("feature/new-dashboard")).toBeTruthy();
    expect(screen.getByText("builder")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
  });

  it("shows workspace_create without agent kind badge when not provided", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ws-create-no-agent",
      name: "workspace_create",
      arguments: { branch: "fix/auth-bug" },
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("fix/auth-bug")).toBeTruthy();
  });

  it("shows workspace_close with the workspace id", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ws-close",
      name: "workspace_close",
      arguments: { workspaceId: "ws-xyz789", projectId: "proj-1" },
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("ws-xyz789")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
  });
});

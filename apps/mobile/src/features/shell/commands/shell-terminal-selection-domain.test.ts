import { describe, expect, it } from "vitest";

import { DEFAULT_TERMINAL_MODEL_ID } from "../state/shell.constants";
import type { TerminalItem } from "../state/shell.types";
import {
  buildCreatedTerminalItem,
  buildUniqueTerminalLabel,
  ensureTerminalInWorkspace,
  prependTerminalToWorkspace,
} from "./shell-terminal-selection-domain";

function createTerminal(input: Partial<TerminalItem> = {}): TerminalItem {
  return {
    id: "terminal-1",
    label: "Terminal",
    orgId: "org-1",
    projectId: "project-1",
    updatedAt: "2026-06-16T00:00:00Z",
    workspaceId: "workspace-1",
    ...input,
  };
}

describe("shell-terminal-selection-domain", () => {
  it("builds a unique label when the base label already exists", () => {
    expect(
      buildUniqueTerminalLabel(
        [
          createTerminal({ id: "terminal-1", label: "Terminal" }),
          createTerminal({ id: "terminal-2", label: "Terminal 2" }),
        ],
        "Terminal",
      ),
    ).toBe("Terminal 3");
  });

  it("builds the created terminal shell record", () => {
    expect(
      buildCreatedTerminalItem({
        createdAt: "2026-06-16T12:00:00Z",
        id: "terminal-1",
        label: "Codex",
        modelId: DEFAULT_TERMINAL_MODEL_ID,
        nodeId: "node-1",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
        workspaceLabel: "local",
      }),
    ).toEqual({
      cachedOutput: null,
      createdAt: "2026-06-16T12:00:00Z",
      id: "terminal-1",
      label: "Codex",
      lastMessagePreview: null,
      modelId: DEFAULT_TERMINAL_MODEL_ID,
      nodeId: "node-1",
      orgId: "org-1",
      projectId: "project-1",
      session: null,
      status: "initializing",
      subtitle: "local",
      updatedAt: "2026-06-16T12:00:00Z",
      workspaceId: "workspace-1",
    });
  });

  it("prepends a created terminal to the workspace terminal list", () => {
    const terminal = createTerminal();
    expect(prependTerminalToWorkspace({}, terminal)).toEqual({
      "workspace-1": [terminal],
    });
  });

  it("ensures an imported terminal is only added once", () => {
    const terminal = createTerminal();
    expect(
      ensureTerminalInWorkspace(
        {
          "workspace-1": [terminal],
        },
        terminal,
      ),
    ).toEqual({
      "workspace-1": [terminal],
    });
  });
});

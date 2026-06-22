import { describe, expect, it } from "vitest";

import type { ShellPaneTab, TerminalMap } from "../state/shell.types";
import { resolvePaneTabTerminalCloseEffect, resolveTerminalRenameTarget } from "./shell-pane-tab-ui-domain";

const paneTabs: ShellPaneTab[] = [
  {
    id: "terminal:terminal-1",
    kind: "terminal",
    terminalId: "terminal-1",
  },
  {
    id: "file:README.md",
    kind: "file",
    path: "README.md",
  },
];

const terminalsById: TerminalMap = {
  "terminal-1": {
    id: "terminal-1",
    label: "Terminal 1",
    orgId: "org-1",
    projectId: "project-1",
    updatedAt: "2026-06-16T00:00:00Z",
    workspaceId: "workspace-1",
  },
};

describe("shell-pane-tab-ui-domain", () => {
  it("returns null for non-terminal pane tabs", () => {
    expect(resolvePaneTabTerminalCloseEffect(paneTabs, terminalsById, "file:README.md")).toBeNull();
  });

  it("resolves the backend terminal close target for terminal pane tabs", () => {
    expect(resolvePaneTabTerminalCloseEffect(paneTabs, terminalsById, "terminal:terminal-1")).toEqual({
      terminal: terminalsById["terminal-1"],
      terminalId: "terminal-1",
    });
  });

  it("returns null when renaming a terminal that does not exist", () => {
    expect(resolveTerminalRenameTarget(terminalsById, "missing-terminal")).toBeNull();
  });

  it("resolves workspace and terminal id for rename flows", () => {
    expect(resolveTerminalRenameTarget(terminalsById, "terminal-1")).toEqual({
      terminalId: "terminal-1",
      workspaceId: "workspace-1",
    });
  });
});

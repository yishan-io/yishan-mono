// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceTaskLinkRow } from "./WorkspaceTaskLinkRow";

vi.mock("../../commands/localTaskCommands", () => ({
  unlinkLocalTaskWorkspace: vi.fn(),
  updateLocalTaskLinkStatus: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const task = {
  id: "task-1",
  projectId: null,
  title: "Tagged task",
  description: "",
  status: "active" as const,
  priority: "high" as const,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  completedAt: null,
  tags: [],
  tagRefs: [
    { id: "tag-1", name: "Frontend" },
    { id: "tag-2", name: "Desktop" },
    { id: "tag-3", name: "Urgent" },
  ],
};
const link = {
  id: "link-1",
  localTaskId: task.id,
  workspaceId: "workspace-1",
  status: "active" as const,
  linkedAt: "2026-01-01",
  unlinkedAt: null,
};

describe("WorkspaceTaskLinkRow", () => {
  it("renders tags in a separate row below the task title", () => {
    render(
      <WorkspaceTaskLinkRow
        link={link}
        task={task}
        selected={false}
        isMutationLoading={false}
        onSelect={vi.fn()}
        tagCatalog={[]}
      />,
    );

    const title = screen.getByText("Tagged task");
    const tagRow = screen.getByTestId("workspace-task-card-tags");
    const card = title.closest(".MuiCard-root");
    expect(card).toBeTruthy();
    if (!card) return;

    expect(title.compareDocumentPosition(tagRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(card).padding).toBe("10px");
    expect(getComputedStyle(card).marginBottom).toBe("4px");
    expect(getComputedStyle(title).fontSize).toBe("0.875rem");
    expect(screen.getByText("Frontend")).toBeTruthy();
    expect(screen.getByText("Desktop")).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();
    expect(screen.queryByText("+1")).toBeNull();
  });
});

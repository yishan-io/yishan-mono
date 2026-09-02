// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocalTask } from "../../localTaskTypes";
import { LocalTaskList } from "./LocalTaskList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) => (options?.title ? `${key}: ${options.title}` : key),
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 44,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 44 })),
  }),
}));

const taskKey = "TASK-1";

const task: LocalTask = {
  id: "task-1",
  key: taskKey,
  projectId: null,
  title: "Align Local Task columns",
  description: "",
  status: "progressing",
  priority: "high",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  completedAt: null,
  hasActiveWorkspace: false,
  tags: [],
  tagRefs: [],
};

describe("LocalTaskList", () => {
  it("renders compact Priority, Key, Status, and Title cells without a table header", () => {
    const onSelect = vi.fn();
    render(
      <LocalTaskList
        tasks={[task]}
        onSelect={onSelect}
        projectDisplayById={{}}
        tagCatalog={[]}
        unavailableTaskIds={new Set()}
        creatingTaskIds={new Set()}
        onCreateWorkspace={vi.fn()}
      />,
    );

    expect(screen.getByRole("table", { name: "localTask.title" })).toBeTruthy();
    expect(screen.queryByRole("columnheader")).toBeNull();

    const taskButton = screen.getByRole("button", { name: task.title });
    const priority = screen.getByLabelText("localTask.fields.priority: localTask.priority.high");
    const key = screen.getByText(taskKey);
    const status = screen.getByLabelText("localTask.status.progressing");
    const title = screen.getByText(task.title);

    expect(priority.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(key.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(taskButton.closest("tr")).toBeTruthy();

    fireEvent.click(priority);
    expect(onSelect).toHaveBeenCalledWith(task.id);

    onSelect.mockClear();
    fireEvent.click(taskButton);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(task.id);
  });
});

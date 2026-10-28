// @vitest-environment jsdom

import { initI18n } from "@renderer/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { ProjectDeleteDialogView } from "./ProjectDeleteDialogView";
import { useProjectDeletionFlow } from "./useProjectDeletionFlow";

const deleteProject = vi.fn();
const projects = [{ id: "project", name: "Missing project" }];
function Harness() {
  const flow = useProjectDeletionFlow({ projects, deleteProject });
  return (
    <>
      <button type="button" onClick={() => flow.handleRequestProjectDeletion("project")}>
        Request
      </button>
      <ProjectDeleteDialogView
        open={Boolean(flow.pendingProjectDeletion)}
        repoName="Missing project"
        isDeleting={flow.isDeletingProject}
        errorMessage={flow.projectDeletionError}
        onCancel={flow.handleCancelProjectDeletion}
        onConfirm={flow.handleConfirmProjectDeletion}
      />
    </>
  );
}
beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("renders deletion failure, keeps confirmation pending, and clears error on retry and new request", async () => {
  deleteProject.mockRejectedValue(new Error("Delete unavailable"));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <Harness />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("Request"));
  const confirm = () =>
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete project" }));
  confirm();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Delete unavailable"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  let finish!: () => void;
  deleteProject.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  confirm();
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  finish();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByText("Request"));
  confirm();
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByText("Request"));
  expect(screen.queryByRole("alert")).toBeNull();
});

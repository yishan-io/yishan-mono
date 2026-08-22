// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateProjectFormView } from "./CreateProjectFormView";

const mocked = vi.hoisted(() => {
  const createProject = vi.fn();
  const openLocalFolderDialog = vi.fn();

  return {
    createProject,
    openLocalFolderDialog,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../commands/projectCommands", () => ({
  createProject: mocked.createProject,
}));

vi.mock("../../host/folderPicker", () => ({
  openLocalFolderDialog: mocked.openLocalFolderDialog,
}));

function renderForm(props: { onCreated?: () => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateProjectFormView submitLabel="Create" onCreated={props.onCreated ?? vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateProjectFormView", () => {
  it("accepts a non-git folder without a path error and enables Create", async () => {
    mocked.openLocalFolderDialog.mockResolvedValueOnce("/tmp/plain-folder");

    renderForm();

    const chooseFolderButton = screen.getByRole("button", { name: "project.form.chooseFolder" });
    fireEvent.click(chooseFolderButton);

    await screen.findByDisplayValue("/tmp/plain-folder");

    expect(screen.queryByText("project.form.notAGitRepo")).toBeNull();

    const createButton = screen.getByRole("button", { name: "Create" }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(false);
  });
});

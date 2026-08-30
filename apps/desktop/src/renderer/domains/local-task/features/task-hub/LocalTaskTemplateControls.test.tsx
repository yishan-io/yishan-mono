// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCAL_TASK_TEMPLATE, localTaskTemplateStore } from "../../state/localTaskTemplateStore";
import { LocalTaskTemplateControls } from "./LocalTaskTemplateControls";

const commands = vi.hoisted(() => ({
  loadLocalTaskTemplates: vi.fn(),
  saveLocalTaskTemplates: vi.fn(),
}));

vi.mock("../../commands/localTaskCommands", () => commands);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const templates = [DEFAULT_LOCAL_TASK_TEMPLATE, { id: "bug", name: "Bug", content: "## Reproduction\n\n" }];

describe("LocalTaskTemplateControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localTaskTemplateStore.getState().setTemplates(templates, "default");
    commands.saveLocalTaskTemplates.mockImplementation(async (input) => {
      localTaskTemplateStore.getState().setTemplates(input.templates, input.agentDefaultId);
    });
  });

  afterEach(() => {
    cleanup();
    localTaskTemplateStore.getState().resetTemplates();
  });

  it("applies a selected template without saving the template collection", () => {
    const onDescriptionChange = vi.fn();

    render(
      <LocalTaskTemplateControls description="Draft" onDescriptionChange={onDescriptionChange} disabled={false} />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.templates.select" }));
    fireEvent.click(screen.getByRole("option", { name: /Bug/ }));

    expect(onDescriptionChange).toHaveBeenCalledWith("## Reproduction\n\n");
    expect(localTaskTemplateStore.getState().selectedTemplateId).toBe("bug");
    expect(commands.saveLocalTaskTemplates).not.toHaveBeenCalled();
  });

  it("saves a custom template through the daemon command and permits its deletion", async () => {
    const onDescriptionChange = vi.fn();
    const { rerender } = render(
      <LocalTaskTemplateControls
        description={"## Goal\n\nShip it"}
        onDescriptionChange={onDescriptionChange}
        disabled={false}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "localTask.templates.name" }), {
      target: { value: "Feature" },
    });
    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.save" }));

    await waitFor(() => expect(commands.saveLocalTaskTemplates).toHaveBeenCalledTimes(1));
    const savedTemplate = commands.saveLocalTaskTemplates.mock.calls[0]?.[0].templates.find(
      (template: { name: string }) => template.name === "Feature",
    );
    expect(savedTemplate).toEqual(expect.objectContaining({ content: "## Goal\n\nShip it" }));

    rerender(
      <LocalTaskTemplateControls
        description={"## Goal\n\nUpdated"}
        onDescriptionChange={onDescriptionChange}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.save" }));
    await waitFor(() => expect(commands.saveLocalTaskTemplates).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.delete" }));
    expect(screen.getByRole("heading", { name: "localTask.templates.deleteTitle" })).toBeTruthy();
    expect(commands.saveLocalTaskTemplates).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.confirmDelete" }));
    await waitFor(() => expect(commands.saveLocalTaskTemplates).toHaveBeenCalledTimes(3));
    expect(commands.saveLocalTaskTemplates.mock.calls[2]?.[0]).toMatchObject({
      templates: [DEFAULT_LOCAL_TASK_TEMPLATE, templates[1]],
      agentDefaultId: "default",
    });
  });

  it("shows a deletion failure in the confirmation dialog", async () => {
    localTaskTemplateStore.getState().setSelectedTemplateId("bug");
    commands.saveLocalTaskTemplates.mockRejectedValueOnce(new Error("template deletion failed"));
    render(<LocalTaskTemplateControls description="Draft" onDescriptionChange={vi.fn()} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.delete" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.confirmDelete" }));

    expect((await screen.findByRole("dialog")).textContent).toContain("template deletion failed");
  });

  it("sets a non-built-in template as the agent default", async () => {
    render(<LocalTaskTemplateControls description="Draft" onDescriptionChange={vi.fn()} disabled={false} />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.templates.select" }));
    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.setAgentDefault" }));

    await waitFor(() =>
      expect(commands.saveLocalTaskTemplates).toHaveBeenCalledWith({ templates, agentDefaultId: "bug" }),
    );
  });

  it("shows a loading state while templates have not loaded", () => {
    localTaskTemplateStore.getState().resetTemplates();
    render(<LocalTaskTemplateControls description="Draft" onDescriptionChange={vi.fn()} disabled={false} />);

    expect(screen.getByText("localTask.templates.loading")).toBeTruthy();
    expect(commands.loadLocalTaskTemplates).toHaveBeenCalledTimes(1);
  });

  it("disables template controls while task creation is pending", () => {
    render(<LocalTaskTemplateControls description="Draft" onDescriptionChange={vi.fn()} disabled />);

    expect(screen.getByRole("combobox", { name: "localTask.templates.select" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect((screen.getByRole("textbox", { name: "localTask.templates.name" }) as HTMLInputElement).disabled).toBe(true);
  });
});

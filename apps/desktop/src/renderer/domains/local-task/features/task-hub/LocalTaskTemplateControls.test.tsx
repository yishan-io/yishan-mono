// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCAL_TASK_TEMPLATE, localTaskTemplateStore } from "../../state/localTaskTemplateStore";
import { LocalTaskTemplateControls } from "./LocalTaskTemplateControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("LocalTaskTemplateControls", () => {
  afterEach(() => {
    cleanup();
    localTaskTemplateStore.getState().resetTemplates();
    window.localStorage.clear();
  });

  it("applies a selected template to the editable task description", () => {
    const customTemplateId = localTaskTemplateStore
      .getState()
      .addTemplate({ name: "Bug", content: "## Reproduction\n\n" });
    const onDescriptionChange = vi.fn();

    render(<LocalTaskTemplateControls description="Draft" onDescriptionChange={onDescriptionChange} disabled={false} />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.templates.select" }));
    fireEvent.click(screen.getByRole("option", { name: "Bug" }));

    expect(onDescriptionChange).toHaveBeenCalledWith("## Reproduction");
    expect(localTaskTemplateStore.getState().selectedTemplateId).toBe(customTemplateId);
  });

  it("saves the current editable description as a personal template and permits its update and deletion", () => {
    const onDescriptionChange = vi.fn();
    const { rerender } = render(
      <LocalTaskTemplateControls description={`## Goal

Ship it`} onDescriptionChange={onDescriptionChange} disabled={false} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "localTask.templates.name" }), {
      target: { value: "Feature" },
    });
    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.save" }));

    const customTemplate = localTaskTemplateStore.getState().templates.find((template) => template.name === "Feature");
    expect(customTemplate).toEqual(expect.objectContaining({ content: `## Goal

Ship it` }));

    rerender(
      <LocalTaskTemplateControls description={`## Goal

Updated`} onDescriptionChange={onDescriptionChange} disabled={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.save" }));
    expect(localTaskTemplateStore.getState().templates).toContainEqual(
      expect.objectContaining({ id: customTemplate?.id, content: `## Goal

Updated` }),
    );

    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.delete" }));
    expect(localTaskTemplateStore.getState().templates).toEqual([DEFAULT_LOCAL_TASK_TEMPLATE]);
  });

  it("disables template controls while task creation is pending", () => {
    render(<LocalTaskTemplateControls description="Draft" onDescriptionChange={vi.fn()} disabled />);

    expect(screen.getByRole("combobox", { name: "localTask.templates.select" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect((screen.getByRole("textbox", { name: "localTask.templates.name" }) as HTMLInputElement).disabled).toBe(true);
  });
});

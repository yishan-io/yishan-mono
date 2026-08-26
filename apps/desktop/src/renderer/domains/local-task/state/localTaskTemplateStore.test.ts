// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_LOCAL_TASK_TEMPLATE,
  LOCAL_TASK_TEMPLATE_STORE_STORAGE_KEY,
  localTaskTemplateStore,
} from "./localTaskTemplateStore";

describe("localTaskTemplateStore", () => {
  afterEach(() => {
    localTaskTemplateStore.getState().resetTemplates();
    window.localStorage.clear();
  });

  it("starts with an immutable structured default template selected", () => {
    const state = localTaskTemplateStore.getState();

    expect(state.templates).toEqual([DEFAULT_LOCAL_TASK_TEMPLATE]);
    expect(state.selectedTemplateId).toBe(DEFAULT_LOCAL_TASK_TEMPLATE.id);
    expect(DEFAULT_LOCAL_TASK_TEMPLATE.content).toContain("## Goal");
    expect(DEFAULT_LOCAL_TASK_TEMPLATE.content).toContain("## Acceptance Criteria");
  });

  it("adds, updates, selects, and removes a personal template", () => {
    const id = localTaskTemplateStore.getState().addTemplate({ name: "Bug fix", content: "## Reproduction" });
    localTaskTemplateStore.getState().updateTemplate(id, { name: "Bug report", content: "## Expected result" });
    localTaskTemplateStore.getState().selectTemplate(id);

    expect(localTaskTemplateStore.getState().selectedTemplateId).toBe(id);
    expect(localTaskTemplateStore.getState().templates).toContainEqual({
      id,
      name: "Bug report",
      content: "## Expected result",
    });

    localTaskTemplateStore.getState().removeTemplate(id);

    expect(localTaskTemplateStore.getState().templates).toEqual([DEFAULT_LOCAL_TASK_TEMPLATE]);
    expect(localTaskTemplateStore.getState().selectedTemplateId).toBe(DEFAULT_LOCAL_TASK_TEMPLATE.id);
  });

  it("does not permit deleting or overwriting the built-in template", () => {
    const { removeTemplate, updateTemplate } = localTaskTemplateStore.getState();

    updateTemplate(DEFAULT_LOCAL_TASK_TEMPLATE.id, { name: "Changed", content: "Changed" });
    removeTemplate(DEFAULT_LOCAL_TASK_TEMPLATE.id);

    expect(localTaskTemplateStore.getState().templates).toEqual([DEFAULT_LOCAL_TASK_TEMPLATE]);
  });

  it("persists only valid personal templates and restores a valid selection", () => {
    window.localStorage.setItem(
      LOCAL_TASK_TEMPLATE_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          templates: [
            { id: "custom-1", name: "Feature", content: "## Goal" },
            { id: "custom-1", name: "Duplicate", content: "Ignored" },
            { id: "invalid", name: "", content: "Ignored" },
          ],
          selectedTemplateId: "missing",
        },
        version: 0,
      }),
    );

    void localTaskTemplateStore.persist.rehydrate();

    expect(localTaskTemplateStore.getState().templates).toEqual([
      DEFAULT_LOCAL_TASK_TEMPLATE,
      { id: "custom-1", name: "Feature", content: "## Goal" },
    ]);
    expect(localTaskTemplateStore.getState().selectedTemplateId).toBe(DEFAULT_LOCAL_TASK_TEMPLATE.id);
  });
});

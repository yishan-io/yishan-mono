import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_LOCAL_TASK_TEMPLATE, localTaskTemplateStore } from "./localTaskTemplateStore";

describe("localTaskTemplateStore", () => {
  afterEach(() => localTaskTemplateStore.getState().resetTemplates());

  it("starts unloaded with an empty dialog selection", () => {
    const state = localTaskTemplateStore.getState();

    expect(state.templates).toBeNull();
    expect(state.agentDefaultId).toBe(DEFAULT_LOCAL_TASK_TEMPLATE.id);
    expect(state.isTemplatesLoading).toBe(false);
    expect(state.selectedTemplateId).toBe("");
  });

  it("stores daemon templates, loading state, and a non-persisted selection", () => {
    const templates = [DEFAULT_LOCAL_TASK_TEMPLATE, { id: "bug", name: "Bug", content: "## Reproduction" }];

    localTaskTemplateStore.getState().setIsTemplatesLoading(true);
    localTaskTemplateStore.getState().setTemplates(templates, "bug");
    localTaskTemplateStore.getState().setSelectedTemplateId("bug");

    expect(localTaskTemplateStore.getState()).toMatchObject({
      templates,
      agentDefaultId: "bug",
      isTemplatesLoading: true,
      selectedTemplateId: "bug",
    });
  });

  it("resets daemon state without restoring renderer localStorage", () => {
    localTaskTemplateStore.getState().setTemplates([DEFAULT_LOCAL_TASK_TEMPLATE], "default");
    localTaskTemplateStore.getState().setSelectedTemplateId("default");

    localTaskTemplateStore.getState().resetTemplates();

    expect(localTaskTemplateStore.getState()).toMatchObject({
      templates: null,
      agentDefaultId: "default",
      isTemplatesLoading: false,
      selectedTemplateId: "",
    });
  });
});

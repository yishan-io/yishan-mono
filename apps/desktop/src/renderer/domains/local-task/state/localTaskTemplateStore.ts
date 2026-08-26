import { create } from "zustand";
import type { LocalTaskTemplate } from "../localTaskTypes";

/** Legacy storage key retained for consumers migrating from renderer persistence. */
export const LOCAL_TASK_TEMPLATE_STORE_STORAGE_KEY = "yishan-local-task-template-store";

/** The daemon always includes this immutable template as its first template. */
export const DEFAULT_LOCAL_TASK_TEMPLATE: LocalTaskTemplate = {
  id: "default",
  name: "Standard task",
  content: `## Goal


## Context


## Scope


## Acceptance Criteria

- 

## Notes

`,
};

/** Holds daemon-backed task templates and the current dialog-only template selection. */
export type LocalTaskTemplateStoreState = {
  /** Templates loaded from daemon, or null before the first load. */
  templates: LocalTaskTemplate[] | null;
  /** ID of the template the Pi agent applies by default. */
  agentDefaultId: string;
  /** Whether a template RPC operation is in progress. */
  isTemplatesLoading: boolean;
  /** Template selected by the current create-task dialog; this is never persisted. */
  selectedTemplateId: string;
  /** Replaces templates and the daemon-owned agent default. */
  setTemplates: (templates: LocalTaskTemplate[], agentDefaultId: string) => void;
  /** Sets template RPC loading state. */
  setIsTemplatesLoading: (loading: boolean) => void;
  /** Selects a template for the current create-task dialog. */
  setSelectedTemplateId: (id: string) => void;
  /** Restores the initial state for tests. */
  resetTemplates: () => void;
};

const INITIAL_TEMPLATE_STATE = {
  templates: null,
  agentDefaultId: DEFAULT_LOCAL_TASK_TEMPLATE.id,
  isTemplatesLoading: false,
  selectedTemplateId: "",
};

/** Stores daemon-backed Local Task templates without renderer persistence. */
export const localTaskTemplateStore = create<LocalTaskTemplateStoreState>()((set) => ({
  ...INITIAL_TEMPLATE_STATE,
  setTemplates: (templates, agentDefaultId) => set({ templates, agentDefaultId }),
  setIsTemplatesLoading: (isTemplatesLoading) => set({ isTemplatesLoading }),
  setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId }),
  resetTemplates: () => set(INITIAL_TEMPLATE_STATE),
}));

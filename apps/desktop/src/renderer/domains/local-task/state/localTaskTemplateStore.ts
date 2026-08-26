import { generateId } from "@shared/ids/generateId";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const LOCAL_TASK_TEMPLATE_STORE_STORAGE_KEY = "yishan-local-task-template-store";
const MAX_TEMPLATE_NAME_LENGTH = 100;
const MAX_TEMPLATE_CONTENT_LENGTH = 10_000;

/** A personal Markdown template available when creating a Local Task. */
export type LocalTaskTemplate = {
  id: string;
  name: string;
  content: string;
};

/** The built-in template is always available and cannot be changed or removed. */
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

type LocalTaskTemplateStorePersistedState = {
  templates: LocalTaskTemplate[];
  selectedTemplateId: string;
};

/** Holds persisted, personal task-description templates for the desktop app. */
export type LocalTaskTemplateStoreState = {
  templates: LocalTaskTemplate[];
  selectedTemplateId: string;
  addTemplate: (template: Omit<LocalTaskTemplate, "id">) => string;
  updateTemplate: (id: string, template: Omit<LocalTaskTemplate, "id">) => void;
  removeTemplate: (id: string) => void;
  selectTemplate: (id: string) => void;
  resetTemplates: () => void;
};

/** Stores personal Local Task description templates in renderer local storage. */
export const localTaskTemplateStore = create<LocalTaskTemplateStoreState>()(
  persist(
    immer((set) => ({
      templates: [DEFAULT_LOCAL_TASK_TEMPLATE],
      selectedTemplateId: DEFAULT_LOCAL_TASK_TEMPLATE.id,
      addTemplate: (template) => {
        const normalizedTemplate = normalizeTemplate({ id: generateId(), ...template });
        if (!normalizedTemplate) throw new Error("Task template name and content are required.");
        set((state) => {
          state.templates.push(normalizedTemplate);
        });
        return normalizedTemplate.id;
      },
      updateTemplate: (id, template) => {
        if (id === DEFAULT_LOCAL_TASK_TEMPLATE.id) return;
        const normalizedTemplate = normalizeTemplate({ id, ...template });
        if (!normalizedTemplate) throw new Error("Task template name and content are required.");
        set((state) => {
          const index = state.templates.findIndex((candidate) => candidate.id === id);
          if (index !== -1) state.templates[index] = normalizedTemplate;
        });
      },
      removeTemplate: (id) => {
        if (id === DEFAULT_LOCAL_TASK_TEMPLATE.id) return;
        set((state) => {
          state.templates = state.templates.filter((template) => template.id !== id);
          if (state.selectedTemplateId === id) state.selectedTemplateId = DEFAULT_LOCAL_TASK_TEMPLATE.id;
        });
      },
      selectTemplate: (id) => {
        set((state) => {
          if (state.templates.some((template) => template.id === id)) state.selectedTemplateId = id;
        });
      },
      resetTemplates: () => {
        set({ templates: [DEFAULT_LOCAL_TASK_TEMPLATE], selectedTemplateId: DEFAULT_LOCAL_TASK_TEMPLATE.id });
      },
    })),
    {
      name: LOCAL_TASK_TEMPLATE_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): LocalTaskTemplateStorePersistedState => ({
        templates: state.templates.filter((template) => template.id !== DEFAULT_LOCAL_TASK_TEMPLATE.id),
        selectedTemplateId: state.selectedTemplateId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = asPersistedState(persistedState);
        const templates = [DEFAULT_LOCAL_TASK_TEMPLATE, ...normalizeTemplates(persisted?.templates)];
        const persistedSelectedTemplateId = persisted?.selectedTemplateId;
        const selectedTemplateId =
          typeof persistedSelectedTemplateId === "string" &&
          templates.some((template) => template.id === persistedSelectedTemplateId)
            ? persistedSelectedTemplateId
            : DEFAULT_LOCAL_TASK_TEMPLATE.id;
        return { ...currentState, templates, selectedTemplateId };
      },
    },
  ),
);

function asPersistedState(value: unknown): Partial<LocalTaskTemplateStorePersistedState> | undefined {
  return typeof value === "object" && value !== null ? (value as Partial<LocalTaskTemplateStorePersistedState>) : undefined;
}

function normalizeTemplates(value: unknown): LocalTaskTemplate[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>([DEFAULT_LOCAL_TASK_TEMPLATE.id]);
  return value.flatMap((candidate) => {
    const template = normalizeTemplate(candidate);
    if (!template || ids.has(template.id)) return [];
    ids.add(template.id);
    return [template];
  });
}

function normalizeTemplate(value: unknown): LocalTaskTemplate | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<LocalTaskTemplate>;
  if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) return undefined;
  if (typeof candidate.name !== "string" || typeof candidate.content !== "string") return undefined;
  const name = candidate.name.trim();
  const content = candidate.content.trim();
  if (
    name.length === 0 ||
    name.length > MAX_TEMPLATE_NAME_LENGTH ||
    content.length === 0 ||
    content.length > MAX_TEMPLATE_CONTENT_LENGTH
  )
    return undefined;
  return { id: candidate.id, name, content };
}

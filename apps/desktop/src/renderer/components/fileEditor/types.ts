import type { MarkdownDefaultViewMode } from "../../store/settings/layoutStore";

/** Supported layout modes for markdown files in the file editor. */
export type MarkdownViewMode = "edit" | "split" | "preview";

/** Props used to initialize markdown view mode behavior. */
export type MarkdownViewModeConfig = {
  isMarkdown: boolean;
  defaultMarkdownViewMode: MarkdownDefaultViewMode;
};

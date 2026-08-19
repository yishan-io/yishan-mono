import { Autocomplete, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";

// Common pi / yishan tool names offered as suggestions in the tools editor.
// Entry is free-form: extensions register tools beyond this list, so any
// name the user types is accepted.
const KNOWN_AGENT_TOOLS = [
  "Agent",
  "apply_patch",
  "ask_user",
  "bash",
  "edit",
  "find",
  "glob",
  "grep",
  "ls",
  "lsp_diagnostics",
  "lsp_fix",
  "mcp",
  "mcpScript",
  "memory_read",
  "memory_reconcile",
  "memory_search",
  "memory_store",
  "read",
  "task_append_note",
  "task_finish",
  "task_list",
  "task_read",
  "task_start",
  "task_write",
  "web_fetch",
  "workspace_close",
  "workspace_create",
  "workspace_find",
  "workspace_list",
  "write",
];

/** Compares two tool lists by value (order matters — it mirrors the frontmatter). */
export function sameToolList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((tool, index) => tool === b[index]);
}

type AgentToolsEditorProps = {
  tools: string[];
  onChange: (tools: string[]) => void;
};

/**
 * Chip editor for the agent's `tools` frontmatter list, split out of the
 * markdown body. Free-form: suggestions come from the known tool set, but any
 * name is accepted because extensions register tools beyond it.
 */
export function AgentToolsEditor({ tools, onChange }: AgentToolsEditorProps) {
  const { t } = useTranslation();
  const label = t("settings.customize.agents.dialogs.toolsLabel");
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={KNOWN_AGENT_TOOLS}
      value={tools}
      onChange={(_event, value) => {
        const next = value
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((tool) => tool !== "");
        onChange(Array.from(new Set(next)));
      }}
      filterSelectedOptions
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={t("settings.customize.agents.dialogs.toolsPlaceholder")}
          helperText={t("settings.customize.agents.dialogs.toolsHelp")}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps.htmlInput,
              "aria-label": label,
            },
          }}
        />
      )}
    />
  );
}

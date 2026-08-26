import { Box, Button, FormControl, MenuItem, Select, TextField } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_LOCAL_TASK_TEMPLATE, localTaskTemplateStore } from "../../state/localTaskTemplateStore";

export interface LocalTaskTemplateControlsProps {
  /** Current task-description draft. */
  description: string;
  /** Replaces the task-description draft after a template selection. */
  onDescriptionChange: (description: string) => void;
  /** Disables template changes while the task is being created. */
  disabled: boolean;
}

/** Selects and maintains personal Markdown templates for a new Local Task. */
export function LocalTaskTemplateControls({ description, onDescriptionChange, disabled }: LocalTaskTemplateControlsProps) {
  const { t } = useTranslation();
  const templates = localTaskTemplateStore((state) => state.templates);
  const selectedTemplateId = localTaskTemplateStore((state) => state.selectedTemplateId);
  const addTemplate = localTaskTemplateStore((state) => state.addTemplate);
  const updateTemplate = localTaskTemplateStore((state) => state.updateTemplate);
  const removeTemplate = localTaskTemplateStore((state) => state.removeTemplate);
  const selectTemplate = localTaskTemplateStore((state) => state.selectTemplate);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? DEFAULT_LOCAL_TASK_TEMPLATE,
    [selectedTemplateId, templates],
  );
  const isBuiltInTemplate = selectedTemplate.id === DEFAULT_LOCAL_TASK_TEMPLATE.id;
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    setTemplateName(isBuiltInTemplate ? "" : selectedTemplate.name);
  }, [isBuiltInTemplate, selectedTemplate.name]);

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      const template = templates.find((candidate) => candidate.id === templateId);
      if (!template) return;
      selectTemplate(template.id);
      onDescriptionChange(template.content);
    },
    [onDescriptionChange, selectTemplate, templates],
  );
  const handleSave = useCallback(() => {
    const name = templateName.trim();
    const content = description.trim();
    if (!name || !content) return;
    if (isBuiltInTemplate) {
      const id = addTemplate({ name, content });
      selectTemplate(id);
      return;
    }
    updateTemplate(selectedTemplate.id, { name, content });
  }, [addTemplate, description, isBuiltInTemplate, selectTemplate, selectedTemplate.id, templateName, updateTemplate]);
  const handleDelete = useCallback(() => removeTemplate(selectedTemplate.id), [removeTemplate, selectedTemplate.id]);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
      <FormControl size="small" sx={{ minWidth: 180, flex: "1 1 180px" }}>
        <Select
          value={selectedTemplate.id}
          disabled={disabled}
          onChange={(event) => handleTemplateChange(event.target.value)}
          inputProps={{ "aria-label": t("localTask.templates.select") }}
        >
          {templates.map((template) => (
            <MenuItem key={template.id} value={template.id}>
              {template.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        size="small"
        value={templateName}
        disabled={disabled}
        placeholder={t("localTask.templates.name")}
        slotProps={{ htmlInput: { "aria-label": t("localTask.templates.name") } }}
        onChange={(event) => setTemplateName(event.target.value)}
        sx={{ flex: "2 1 180px" }}
      />
      <Button disabled={disabled || !templateName.trim() || !description.trim()} onClick={handleSave}>
        {t("localTask.templates.save")}
      </Button>
      {!isBuiltInTemplate ? (
        <Button color="error" disabled={disabled} onClick={handleDelete}>
          {t("localTask.templates.delete")}
        </Button>
      ) : null}
    </Box>
  );
}

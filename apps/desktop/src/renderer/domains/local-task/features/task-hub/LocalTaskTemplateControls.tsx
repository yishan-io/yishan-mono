import { Alert, Box, Button, CircularProgress, FormControl, IconButton, MenuItem, Select, TextField, Tooltip } from "@mui/material";
import { generateId } from "@shared/ids/generateId";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadLocalTaskTemplates, saveLocalTaskTemplates } from "../../commands/localTaskCommands";
import type { LocalTaskTemplate } from "../../localTaskTypes";
import { DEFAULT_LOCAL_TASK_TEMPLATE, localTaskTemplateStore } from "../../state/localTaskTemplateStore";

export interface LocalTaskTemplateControlsProps {
  /** Current task-description draft. */
  description: string;
  /** Replaces the task-description draft after a template selection. */
  onDescriptionChange: (description: string) => void;
  /** Disables template changes while the task is being created. */
  disabled: boolean;
}

/** Selects and maintains daemon-backed Markdown templates for a new Local Task. */
export function LocalTaskTemplateControls({ description, onDescriptionChange, disabled }: LocalTaskTemplateControlsProps) {
  const { t } = useTranslation();
  const templates = localTaskTemplateStore((state) => state.templates);
  const agentDefaultId = localTaskTemplateStore((state) => state.agentDefaultId);
  const isTemplatesLoading = localTaskTemplateStore((state) => state.isTemplatesLoading);
  const selectedTemplateId = localTaskTemplateStore((state) => state.selectedTemplateId);
  const setSelectedTemplateId = localTaskTemplateStore((state) => state.setSelectedTemplateId);
  const [templateName, setTemplateName] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    if (templates === null) void loadLocalTaskTemplates();
  }, [templates]);

  const selectedTemplate = useMemo(() => {
    if (!templates) return DEFAULT_LOCAL_TASK_TEMPLATE;
    return (
      templates.find((template) => template.id === selectedTemplateId) ??
      templates.find((template) => template.id === agentDefaultId) ??
      DEFAULT_LOCAL_TASK_TEMPLATE
    );
  }, [agentDefaultId, selectedTemplateId, templates]);
  const isBuiltInTemplate = selectedTemplate.id === DEFAULT_LOCAL_TASK_TEMPLATE.id;
  const isDisabled = disabled || isTemplatesLoading;

  useEffect(() => {
    setTemplateName(isBuiltInTemplate ? "" : selectedTemplate.name);
  }, [isBuiltInTemplate, selectedTemplate.name]);

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      const template = templates?.find((candidate) => candidate.id === templateId);
      if (!template) return;
      setSelectedTemplateId(template.id);
      onDescriptionChange(template.content);
    },
    [onDescriptionChange, setSelectedTemplateId, templates],
  );
  const handleSave = useCallback(async () => {
    if (!templates) return;
    const name = templateName.trim();
    const content = description.trim();
    if (!name || !content) return;
    setTemplateError(null);
    const savedTemplate: LocalTaskTemplate = isBuiltInTemplate
      ? { id: generateId(), name, content }
      : { id: selectedTemplate.id, name, content };
    const updatedTemplates = isBuiltInTemplate
      ? [...templates, savedTemplate]
      : templates.map((template) => (template.id === savedTemplate.id ? savedTemplate : template));
    try {
      await saveLocalTaskTemplates({ templates: updatedTemplates, agentDefaultId });
      setSelectedTemplateId(savedTemplate.id);
    } catch (error) {
      setTemplateError(getErrorMessage(error));
    }
  }, [agentDefaultId, description, isBuiltInTemplate, selectedTemplate.id, setSelectedTemplateId, templateName, templates]);
  const handleDelete = useCallback(async () => {
    if (!templates || isBuiltInTemplate) return;
    setTemplateError(null);
    const updatedTemplates = templates.filter((template) => template.id !== selectedTemplate.id);
    const updatedAgentDefaultId = agentDefaultId === selectedTemplate.id ? DEFAULT_LOCAL_TASK_TEMPLATE.id : agentDefaultId;
    try {
      await saveLocalTaskTemplates({ templates: updatedTemplates, agentDefaultId: updatedAgentDefaultId });
      setSelectedTemplateId(DEFAULT_LOCAL_TASK_TEMPLATE.id);
      onDescriptionChange(DEFAULT_LOCAL_TASK_TEMPLATE.content);
    } catch (error) {
      setTemplateError(getErrorMessage(error));
    }
  }, [agentDefaultId, isBuiltInTemplate, onDescriptionChange, selectedTemplate.id, setSelectedTemplateId, templates]);
  const handleSetAgentDefault = useCallback(
    async (templateId: string) => {
      if (!templates || templateId === agentDefaultId) return;
      setTemplateError(null);
      try {
        await saveLocalTaskTemplates({ templates, agentDefaultId: templateId });
      } catch (error) {
        setTemplateError(getErrorMessage(error));
      }
    },
    [agentDefaultId, templates],
  );

  if (templates === null) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CircularProgress size={16} />
        {t("localTask.templates.loading")}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {templateError ? <Alert severity="error">{templateError}</Alert> : null}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <FormControl size="small" sx={{ flex: "1 1 0", minWidth: 0 }}>
          <Select
            value={selectedTemplate.id}
            disabled={isDisabled}
            onChange={(event) => handleTemplateChange(event.target.value)}
            inputProps={{ "aria-label": t("localTask.templates.select") }}
            renderValue={(value) => templates.find((template) => template.id === value)?.name ?? ""}
          >
            {templates.map((template) => {
              const isAgentDefault = template.id === agentDefaultId;
              const isBuiltIn = template.id === DEFAULT_LOCAL_TASK_TEMPLATE.id;
              return (
                <MenuItem
                  key={template.id}
                  value={template.id}
                  sx={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 0.5 }}
                >
                  <Box sx={{ flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {template.name}
                  </Box>
                  {isAgentDefault ? (
                    <Tooltip title={t("localTask.templates.agentDefault")}>
                      <Box
                        component="span"
                        aria-label={t("localTask.templates.agentDefault")}
                        sx={{ flexShrink: 0, lineHeight: 1 }}
                      >
                        ★
                      </Box>
                    </Tooltip>
                  ) : null}
                  {!isBuiltIn ? (
                    <Tooltip title={t("localTask.templates.setAgentDefault")}>
                      <IconButton
                        size="small"
                        disabled={isDisabled}
                        aria-label={t("localTask.templates.setAgentDefault")}
                        sx={{ flexShrink: 0, p: 0.25 }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleSetAgentDefault(template.id);
                        }}
                      >
                        ☆
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        <TextField
          size="small"
          value={templateName}
          disabled={isDisabled}
          placeholder={t("localTask.templates.name")}
          slotProps={{ htmlInput: { "aria-label": t("localTask.templates.name") } }}
          onChange={(event) => setTemplateName(event.target.value)}
          sx={{ flex: "2 1 0", minWidth: 0 }}
        />
        <Button
          size="small"
          disabled={isDisabled || !templateName.trim() || !description.trim()}
          onClick={handleSave}
          sx={{ flexShrink: 0 }}
        >
          {t("localTask.templates.save")}
        </Button>
        {!isBuiltInTemplate ? (
          <Button color="error" size="small" disabled={isDisabled} onClick={handleDelete} sx={{ flexShrink: 0 }}>
            {t("localTask.templates.delete")}
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import { useCommands } from "@renderer/hooks/useCommands";
import { useDialogRegistration } from "@renderer/hooks/useDialogRegistration";
import { workspaceStore } from "@renderer/store/workspaceStore";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProjectConfigCommandsSection } from "./projectConfigDialog/ProjectConfigCommandsSection";
import { ProjectConfigGeneralSection } from "./projectConfigDialog/ProjectConfigGeneralSection";
import { ProjectConfigIconPickerPopover } from "./projectConfigDialog/ProjectConfigIconPickerPopover";
import { ProjectConfigScriptsSection } from "./projectConfigDialog/ProjectConfigScriptsSection";
import { ProjectConfigSectionNav } from "./projectConfigDialog/ProjectConfigSectionNav";
import {
  type ProjectConfigSectionId,
  getProjectConfigSectionItems,
} from "./projectConfigDialog/projectConfigDialogConstants";
import { useProjectConfigActions } from "./useProjectConfigActions";
import { useProjectConfigFormState } from "./useProjectConfigFormState";

type ProjectConfigDialogViewProps = {
  open: boolean;
  repoId: string;
  onClose: () => void;
};

export function ProjectConfigDialogView({ open, repoId, onClose }: ProjectConfigDialogViewProps) {
  const { t } = useTranslation();
  const projects = workspaceStore((state) => state.projects);
  const { getDefaultWorktreeLocation } = useCommands();
  const {
    repo,
    draft,
    setDraft,
    iconAnchorEl,
    setIconAnchorEl,
    repoLocalPath,
    repoGitUrl,
    repoKey,
    trimmedRepoLocalPath,
  } = useProjectConfigFormState({ open, repoId, projects, getDefaultWorktreeLocation });
  const { isSaving, handlePickWorktreeFolder, handleOpenRepoLocalPath, handleSave } = useProjectConfigActions({
    repo,
    draft,
    setDraft,
    trimmedRepoLocalPath,
    onClose,
  });
  const [activeSection, setActiveSection] = useState<ProjectConfigSectionId>("general");

  useDialogRegistration(open);

  const sectionItems = useMemo(() => getProjectConfigSectionItems(t), [t]);

  return (
    <Dialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown={isSaving}
    >
      <DialogTitle>{t("project.actions.config")}</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Stack direction="row" sx={{ minHeight: 420 }}>
          <ProjectConfigSectionNav activeSection={activeSection} items={sectionItems} onSelect={setActiveSection} />
          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            {activeSection === "general" && (
              <ProjectConfigGeneralSection
                draft={draft}
                isSaving={isSaving}
                repoGitUrl={repoGitUrl}
                repoKey={repoKey}
                repoLocalPath={repoLocalPath}
                setDraft={setDraft}
                setIconAnchorEl={setIconAnchorEl}
                trimmedRepoLocalPath={trimmedRepoLocalPath}
                onOpenRepoLocalPath={handleOpenRepoLocalPath}
                onPickWorktreeFolder={handlePickWorktreeFolder}
              />
            )}
            {activeSection === "scripts" && (
              <ProjectConfigScriptsSection draft={draft} isSaving={isSaving} setDraft={setDraft} />
            )}
            {activeSection === "commands" && (
              <ProjectConfigCommandsSection draft={draft} isSaving={isSaving} setDraft={setDraft} />
            )}
          </Box>
        </Stack>
      </DialogContent>
      <ProjectConfigIconPickerPopover
        anchorEl={iconAnchorEl}
        icon={draft.icon}
        setDraft={setDraft}
        setIconAnchorEl={setIconAnchorEl}
      />
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!repo || isSaving}
          startIcon={isSaving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isSaving ? t("common.actions.saving", { defaultValue: "Saving..." }) : t("common.actions.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

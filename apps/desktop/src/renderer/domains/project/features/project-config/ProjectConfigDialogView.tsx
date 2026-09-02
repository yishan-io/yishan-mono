import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import { useDialogRegistration } from "@renderer/domains/workbench";
import { isFolderWorkspace, workspaceStore } from "@renderer/domains/workspace";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { copyProjectTaskPrefix, ensureProjectTaskPrefix } from "../../commands/projectCommands";
import { getDefaultWorktreeLocation } from "../../daemon/projectDaemonClient";
import { projectStore } from "../../state/projectStore";
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
  const projects = projectStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
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
  const [isEnsuringTaskPrefix, setIsEnsuringTaskPrefix] = useState(false);
  const [taskPrefixError, setTaskPrefixError] = useState<string | null>(null);

  const handleEnsureTaskPrefix = async () => {
    if (!repo) {
      return;
    }

    setIsEnsuringTaskPrefix(true);
    setTaskPrefixError(null);
    try {
      await ensureProjectTaskPrefix(repo.id);
    } catch (error) {
      setTaskPrefixError(getErrorMessage(error));
    } finally {
      setIsEnsuringTaskPrefix(false);
    }
  };

  const handleCopyTaskPrefix = async () => {
    if (!repo?.taskPrefix) {
      return;
    }

    setTaskPrefixError(null);
    try {
      await copyProjectTaskPrefix(repo.id);
    } catch (error) {
      setTaskPrefixError(getErrorMessage(error));
    }
  };
  const isFolderWorkspaceConfig = workspaces.some(
    (workspace) => (workspace.repoId === repoId || workspace.projectId === repoId) && isFolderWorkspace(workspace),
  );
  const displayedSection = isFolderWorkspaceConfig && activeSection === "scripts" ? "general" : activeSection;

  useDialogRegistration(open);

  const sectionItems = useMemo(
    () => getProjectConfigSectionItems(t, !isFolderWorkspaceConfig),
    [isFolderWorkspaceConfig, t],
  );

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (isSaving) {
          return;
        }
        onClose();
      }}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>{t("project.actions.config")}</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Stack direction="row" sx={{ minHeight: 420 }}>
          <ProjectConfigSectionNav activeSection={displayedSection} items={sectionItems} onSelect={setActiveSection} />
          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            {displayedSection === "general" && (
              <ProjectConfigGeneralSection
                draft={draft}
                isSaving={isSaving}
                repoGitUrl={repoGitUrl}
                repoKey={repoKey}
                repoLocalPath={repoLocalPath}
                taskPrefix={repo?.taskPrefix ?? null}
                taskPrefixError={taskPrefixError}
                isEnsuringTaskPrefix={isEnsuringTaskPrefix}
                setDraft={setDraft}
                setIconAnchorEl={setIconAnchorEl}
                trimmedRepoLocalPath={trimmedRepoLocalPath}
                onOpenRepoLocalPath={handleOpenRepoLocalPath}
                onPickWorktreeFolder={handlePickWorktreeFolder}
                onEnsureTaskPrefix={handleEnsureTaskPrefix}
                onCopyTaskPrefix={handleCopyTaskPrefix}
              />
            )}
            {displayedSection === "scripts" && !isFolderWorkspaceConfig && (
              <ProjectConfigScriptsSection draft={draft} isSaving={isSaving} setDraft={setDraft} />
            )}
            {displayedSection === "commands" && (
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

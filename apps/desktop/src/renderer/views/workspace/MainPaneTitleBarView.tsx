import { Box, Button, Tooltip, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronRight, LuPanelLeft, LuPanelRight, LuPlay } from "react-icons/lu";
import { getMainWindowFullscreenState } from "../../commands/appCommands";
import { PaneHeader } from "../../components/PaneHeader";
import { PaneToggleButton } from "../../components/PaneToggleButton";
import { renderProjectIcon } from "../../components/projectIcons";
import { getRendererPlatform } from "../../helpers/platform";
import { useCommands } from "../../hooks/useCommands";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { getShortcutDisplayLabelById } from "../../shortcuts/shortcutDisplay";
import { chatStore } from "../../store/chatStore";
import { workspaceStore } from "../../store/workspaceStore";
import {
  AddProjectCommandDialog,
  ProjectCommandsMenu,
  RepoSelectorMenu,
  WorkspaceSelectorMenu,
} from "./mainPaneTitleBarMenus";
import { WorkspacePortsMenuControl } from "./WorkspacePortsMenuControl";
import { renderWorkspaceKindIcon, resolvePrimaryWorkspaceId } from "./mainPaneTitleBarHelpers";

/** Renders the main pane title bar with repo/workspace selectors and pane toggle controls. */
export function MainPaneTitleBarView() {
  const { t } = useTranslation();
  const { leftCollapsed, rightCollapsed, onToggleLeftPane, onToggleRightPane } = useWorkspacePaneVisibilityContext();
  const projects = workspaceStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const workspaceAgentStatusByWorkspaceId = chatStore((state) => state.workspaceAgentStatusByWorkspaceId);
  const workspaceUnreadToneByWorkspaceId = chatStore((state) => state.workspaceUnreadToneByWorkspaceId);
  const { setSelectedRepoId, setSelectedWorkspaceId, openTab, updateProjectConfig } = useCommands();
  const selectedRepo = projects.find((project) => project.id === selectedProjectId);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const workspacesForSelectedRepo = workspaces.filter((workspace) => workspace.repoId === selectedRepo?.id);
  const primaryWorkspaceId = resolvePrimaryWorkspaceId(selectedRepo, workspacesForSelectedRepo);
  const rendererPlatform = getRendererPlatform();
  const toggleLeftShortcutLabel = getShortcutDisplayLabelById("toggle-left-pane", rendererPlatform);
  const toggleRightShortcutLabel = getShortcutDisplayLabelById("toggle-right-pane", rendererPlatform);
  const toggleLeftTooltipLabel = toggleLeftShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("layout.toggleLeftSidebar"),
        shortcut: toggleLeftShortcutLabel,
      })
    : t("layout.toggleLeftSidebar");
  const toggleRightTooltipLabel = toggleRightShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("layout.toggleRightSidebar"),
        shortcut: toggleRightShortcutLabel,
      })
    : t("layout.toggleRightSidebar");
  const [isFullscreenDisplayMode, setIsFullscreenDisplayMode] = useState(false);
  const shouldReserveMacWindowControlsInset =
    rendererPlatform === "darwin" && leftCollapsed && !isFullscreenDisplayMode;
  const [repoMenuAnchorEl, setRepoMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [workspaceMenuAnchorEl, setWorkspaceMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [commandMenuAnchorEl, setCommandMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [isAddCommandDialogOpen, setIsAddCommandDialogOpen] = useState(false);
  const [newCommandNameValue, setNewCommandNameValue] = useState("");
  const [newCommandLineValue, setNewCommandLineValue] = useState("");
  const [isSavingCommand, setIsSavingCommand] = useState(false);
  const [addCommandError, setAddCommandError] = useState("");
  const [repoSearchValue, setRepoSearchValue] = useState("");
  const [workspaceSearchValue, setWorkspaceSearchValue] = useState("");
  const isRepoMenuOpen = Boolean(repoMenuAnchorEl);
  const isWorkspaceMenuOpen = Boolean(workspaceMenuAnchorEl);
  const isCommandMenuOpen = Boolean(commandMenuAnchorEl);
  const projectCommands = (selectedRepo?.commands ?? []).filter(
    (item) => item.name.trim().length > 0 && item.command.trim().length > 0,
  );
  const filteredRepoOptions = projects.filter((project) =>
    project.name.toLowerCase().includes(repoSearchValue.trim().toLowerCase()),
  );
  const filteredWorkspaceOptions = workspacesForSelectedRepo.filter((workspace) =>
    workspace.name.toLowerCase().includes(workspaceSearchValue.trim().toLowerCase()),
  );
  const trimmedNewCommandNameValue = newCommandNameValue.trim();
  const trimmedNewCommandLineValue = newCommandLineValue.trim();
  const isAddCommandDisabled =
    !selectedRepo || trimmedNewCommandNameValue.length === 0 || trimmedNewCommandLineValue.length === 0 || isSavingCommand;
  const resolveWorkspaceIconColor = (
    workspaceId: string,
  ): "warning.main" | "error.main" | "success.main" | "text.secondary" => {
    const runtimeStatus = workspaceAgentStatusByWorkspaceId[workspaceId] ?? "idle";
    const unreadTone = workspaceUnreadToneByWorkspaceId[workspaceId];
    if (runtimeStatus === "waiting_input") {
      return "warning.main";
    }

    if (unreadTone === "error") {
      return "error.main";
    }

    if (unreadTone === "success") {
      return "success.main";
    }

    return "text.secondary";
  };
  useEffect(() => {
    let isDisposed = false;
    /** Syncs one fullscreen snapshot from the host window state. */
    const syncFullscreenState = async () => {
      try {
        const fullscreenState = await getMainWindowFullscreenState();
        if (!isDisposed) {
          setIsFullscreenDisplayMode(fullscreenState.isFullscreen);
        }
      } catch {
        if (!isDisposed) {
          setIsFullscreenDisplayMode(false);
        }
      }
    };

    const handleWindowResize = () => {
      void syncFullscreenState();
    };

    void syncFullscreenState();
    window.addEventListener("resize", handleWindowResize);

    return () => {
      isDisposed = true;
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  const handleSaveNewCommand = async () => {
    if (!selectedRepo || trimmedNewCommandNameValue.length === 0 || trimmedNewCommandLineValue.length === 0) {
      return;
    }

    const existingCommands = (selectedRepo.commands ?? []).filter(
      (item) => item.name.trim().length > 0 && item.command.trim().length > 0,
    );
    const duplicate = existingCommands.some(
      (item) => item.name.trim() === trimmedNewCommandNameValue || item.command.trim() === trimmedNewCommandLineValue,
    );
    if (duplicate) {
      setIsAddCommandDialogOpen(false);
      setNewCommandNameValue("");
      setNewCommandLineValue("");
      setAddCommandError("");
      return;
    }

    setIsSavingCommand(true);
    setAddCommandError("");
    try {
      await updateProjectConfig(selectedRepo.id, {
        name: selectedRepo.name,
        worktreePath: selectedRepo.worktreePath ?? "",
        contextEnabled: selectedRepo.contextEnabled,
        icon: selectedRepo.icon ?? undefined,
        color: selectedRepo.color ?? undefined,
        setupScript: selectedRepo.setupScript ?? "",
        postScript: selectedRepo.postScript ?? "",
        commands: [
          ...existingCommands,
          {
            name: trimmedNewCommandNameValue,
            command: trimmedNewCommandLineValue,
          },
        ],
      });
      setIsAddCommandDialogOpen(false);
      setNewCommandNameValue("");
      setNewCommandLineValue("");
      setAddCommandError("");
    } catch (error) {
      console.error("Failed to add project command", error);
      setAddCommandError("Failed to save command. Please try again.");
    } finally {
      setIsSavingCommand(false);
    }
  };

  return (
    <>
      <PaneHeader showMacInset={shouldReserveMacWindowControlsInset} macInsetTestId="main-pane-macos-controls-inset">
        <Box
          className="electron-webkit-app-region-no-drag"
          sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}
        >
          {leftCollapsed ? (
            <PaneToggleButton
              tooltipLabel={toggleLeftTooltipLabel}
              ariaLabel={t("layout.toggleLeftSidebar")}
              icon={<LuPanelLeft size={16} />}
              onClick={onToggleLeftPane}
            />
          ) : null}
          <Button
            size="small"
            variant="outlined"
            aria-label={t("project.selected")}
            startIcon={renderProjectIcon(selectedRepo?.icon ?? undefined, 14)}
            onClick={(event) => {
              setRepoMenuAnchorEl(event.currentTarget);
              setRepoSearchValue("");
            }}
            sx={{
              textTransform: "none",
              color: "text.secondary",
              borderColor: "transparent",
              bgcolor: "transparent",
              maxWidth: 180,
              "&:hover": {
                borderColor: "divider",
                bgcolor: "action.hover",
              },
            }}
          >
            <Typography variant="body2" noWrap>
              {selectedRepo?.name ?? t("project.unknown")}
            </Typography>
          </Button>
          <LuChevronRight size={14} />
          <Button
            size="small"
            variant="outlined"
            aria-label={t("workspace.column")}
            data-testid="main-pane-workspace-selector"
            startIcon={
              <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                {renderWorkspaceKindIcon(selectedWorkspace, selectedWorkspace?.id === primaryWorkspaceId, 14)}
              </Box>
            }
            onClick={(event) => {
              setWorkspaceMenuAnchorEl(event.currentTarget);
              setWorkspaceSearchValue("");
            }}
            sx={{
              textTransform: "none",
              color: "text.secondary",
              borderColor: "transparent",
              bgcolor: "transparent",
              maxWidth: 220,
              "&:hover": {
                borderColor: "divider",
                bgcolor: "action.hover",
              },
            }}
          >
            <Typography variant="body2" noWrap>
              {selectedWorkspace?.name ?? t("workspace.emptySelection")}
            </Typography>
          </Button>
        </Box>
        <Box className="electron-webkit-app-region-no-drag" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Tooltip title="Project commands" arrow>
            <span>
              <Button
                size="small"
                variant="outlined"
                aria-label="Run project command"
                disabled={!selectedRepo}
                onClick={(event) => setCommandMenuAnchorEl(event.currentTarget)}
                sx={{
                  minWidth: 32,
                  px: 0.75,
                  color: "text.secondary",
                  borderColor: "transparent",
                  bgcolor: "transparent",
                  "&:hover": {
                    borderColor: "divider",
                    bgcolor: "action.hover",
                  },
                }}
              >
                <LuPlay size={14} />
              </Button>
            </span>
          </Tooltip>
          <WorkspacePortsMenuControl />
          {rightCollapsed ? (
            <PaneToggleButton
              tooltipLabel={toggleRightTooltipLabel}
              ariaLabel={t("layout.toggleRightSidebar")}
              icon={<LuPanelRight size={16} />}
              onClick={onToggleRightPane}
            />
          ) : null}
        </Box>
      </PaneHeader>
      <RepoSelectorMenu
        open={isRepoMenuOpen}
        anchorEl={repoMenuAnchorEl}
        repoSearchValue={repoSearchValue}
        setRepoSearchValue={setRepoSearchValue}
        filteredRepoOptions={filteredRepoOptions}
        selectedProjectId={selectedProjectId}
        setSelectedRepoId={setSelectedRepoId}
        setRepoMenuAnchorEl={setRepoMenuAnchorEl}
        setWorkspaceMenuAnchorEl={setWorkspaceMenuAnchorEl}
        setWorkspaceSearchValue={setWorkspaceSearchValue}
        t={t}
      />
      <ProjectCommandsMenu
        open={isCommandMenuOpen}
        anchorEl={commandMenuAnchorEl}
        onClose={() => setCommandMenuAnchorEl(null)}
        projectCommands={projectCommands}
        selectedWorkspaceId={selectedWorkspaceId}
        openTab={openTab}
        terminalTitle={t("terminal.title")}
        onOpenAddDialog={() => {
          setCommandMenuAnchorEl(null);
          setNewCommandNameValue("");
          setNewCommandLineValue("");
          setAddCommandError("");
          setIsAddCommandDialogOpen(true);
        }}
      />
      <WorkspaceSelectorMenu
        open={isWorkspaceMenuOpen}
        anchorEl={workspaceMenuAnchorEl}
        workspaceSearchValue={workspaceSearchValue}
        setWorkspaceSearchValue={setWorkspaceSearchValue}
        filteredWorkspaceOptions={filteredWorkspaceOptions}
        selectedWorkspaceId={selectedWorkspaceId}
        setSelectedWorkspaceId={setSelectedWorkspaceId}
        setWorkspaceMenuAnchorEl={setWorkspaceMenuAnchorEl}
        resolveWorkspaceIconColor={resolveWorkspaceIconColor}
        primaryWorkspaceId={primaryWorkspaceId}
        t={t}
      />
      <AddProjectCommandDialog
        open={isAddCommandDialogOpen}
        isSaving={isSavingCommand}
        commandNameValue={newCommandNameValue}
        commandLineValue={newCommandLineValue}
        errorMessage={addCommandError}
        onClose={() => {
          setIsAddCommandDialogOpen(false);
          setAddCommandError("");
        }}
        onNameChange={setNewCommandNameValue}
        onCommandChange={setNewCommandLineValue}
        onSubmit={() => void handleSaveNewCommand()}
        isSubmitDisabled={isAddCommandDisabled}
        cancelLabel={t("common.actions.cancel")}
      />
    </>
  );
}

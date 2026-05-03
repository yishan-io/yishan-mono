import { Box, Button, IconButton, Menu, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronRight, LuFolderGit2, LuMonitor, LuPanelLeft, LuPanelRight } from "react-icons/lu";
import { getMainWindowFullscreenState } from "../../commands/appCommands";
import { renderProjectIcon } from "../../components/projectIcons";
import { getRendererPlatform } from "../../helpers/platform";
import { useCommands } from "../../hooks/useCommands";
import { useWorkspacePaneVisibilityContext } from "../../hooks/useWorkspacePaneVisibility";
import { getShortcutDisplayLabelById } from "../../shortcuts/shortcutDisplay";
import type { RepoWorkspaceItem, WorkspaceProjectRecord } from "../../store/types";
import { workspaceStore } from "../../store/workspaceStore";
import { WorkspacePortsMenuControl } from "./WorkspacePortsMenuControl";

const titleBarSx = {
  minHeight: 42,
  px: 1.5,
  borderBottom: 1,
  borderColor: "divider",
  bgcolor: "background.paper",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
} as const;

/** Resolves the workspace displayed as local in the left pane for a project. */
function resolvePrimaryWorkspaceId(project: WorkspaceProjectRecord | undefined, workspaces: RepoWorkspaceItem[]) {
  const preferredProjectPath =
    project?.localPath?.trim() || project?.path?.trim() || project?.worktreePath?.trim() || "";
  if (!project || !preferredProjectPath) {
    return undefined;
  }

  return workspaces.find(
    (workspace) =>
      workspace.repoId === project.id &&
      workspace.kind !== "local" &&
      workspace.worktreePath?.trim() === preferredProjectPath,
  )?.id;
}

/** Renders the same workspace kind icon used by left-pane workspace rows. */
function renderWorkspaceKindIcon(workspace: RepoWorkspaceItem | undefined, isPrimaryWorkspace: boolean, size: number) {
  if (workspace?.kind === "local" || isPrimaryWorkspace) {
    return <LuMonitor size={size} />;
  }

  return <LuFolderGit2 size={size} />;
}

/** Renders the main pane title bar with repo/workspace selectors and pane toggle controls. */
export function MainPaneTitleBarView() {
  const { t } = useTranslation();
  const { leftCollapsed, rightCollapsed, onToggleLeftPane, onToggleRightPane } = useWorkspacePaneVisibilityContext();
  const projects = workspaceStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const { setSelectedRepoId, setSelectedWorkspaceId } = useCommands();
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
  const [repoSearchValue, setRepoSearchValue] = useState("");
  const [workspaceSearchValue, setWorkspaceSearchValue] = useState("");
  const isRepoMenuOpen = Boolean(repoMenuAnchorEl);
  const isWorkspaceMenuOpen = Boolean(workspaceMenuAnchorEl);
  const filteredRepoOptions = projects.filter((project) =>
    project.name.toLowerCase().includes(repoSearchValue.trim().toLowerCase()),
  );
  const filteredWorkspaceOptions = workspacesForSelectedRepo.filter((workspace) =>
    workspace.name.toLowerCase().includes(workspaceSearchValue.trim().toLowerCase()),
  );

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

  return (
    <>
      <Box component="header" className="electron-webkit-app-region-drag" sx={titleBarSx}>
        <Box
          className="electron-webkit-app-region-no-drag"
          sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}
        >
          {shouldReserveMacWindowControlsInset ? (
            <Box data-testid="main-pane-macos-controls-inset" sx={{ width: 72, flexShrink: 0 }} />
          ) : null}
          {leftCollapsed ? (
            <Tooltip title={toggleLeftTooltipLabel} arrow>
              <span>
                <IconButton
                  size="small"
                  aria-label={t("layout.toggleLeftSidebar")}
                  onClick={onToggleLeftPane}
                  disabled={!onToggleLeftPane}
                >
                  <LuPanelLeft size={16} />
                </IconButton>
              </span>
            </Tooltip>
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
            startIcon={renderWorkspaceKindIcon(selectedWorkspace, selectedWorkspace?.id === primaryWorkspaceId, 14)}
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
          <WorkspacePortsMenuControl />
          {rightCollapsed ? (
            <Tooltip title={toggleRightTooltipLabel} arrow>
              <span>
                <IconButton
                  size="small"
                  aria-label={t("layout.toggleRightSidebar")}
                  onClick={onToggleRightPane}
                  disabled={!onToggleRightPane}
                >
                  <LuPanelRight size={16} />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Box>
      </Box>
      <Menu
        open={isRepoMenuOpen}
        anchorEl={repoMenuAnchorEl}
        onClose={() => {
          setRepoMenuAnchorEl(null);
          setRepoSearchValue("");
        }}
      >
        <MenuItem disableRipple disableTouchRipple disableGutters sx={{ px: 1, py: 0.5, cursor: "default" }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            placeholder={t("org.menu.search.repo")}
            value={repoSearchValue}
            onChange={(event) => {
              setRepoSearchValue(event.target.value);
            }}
            slotProps={{ htmlInput: { "aria-label": t("org.menu.search.repo") } }}
            sx={{
              "& .MuiInputBase-root": { minHeight: 28 },
              "& .MuiInputBase-input": { py: 0.5, fontSize: 13 },
            }}
          />
        </MenuItem>
        {filteredRepoOptions.map((repo) => (
          <MenuItem
            key={repo.id}
            selected={repo.id === selectedProjectId}
            onClick={() => {
              setSelectedRepoId(repo.id);
              setRepoMenuAnchorEl(null);
              setWorkspaceMenuAnchorEl(null);
              setRepoSearchValue("");
              setWorkspaceSearchValue("");
            }}
          >
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", mr: 1 }}>
              {renderProjectIcon(repo.icon ?? undefined, 14)}
            </Box>
            <Typography variant="body2" noWrap>
              {repo.name}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
      <Menu
        open={isWorkspaceMenuOpen}
        anchorEl={workspaceMenuAnchorEl}
        onClose={() => {
          setWorkspaceMenuAnchorEl(null);
          setWorkspaceSearchValue("");
        }}
      >
        <MenuItem disableRipple disableTouchRipple disableGutters sx={{ px: 1, py: 0.5, cursor: "default" }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            placeholder={t("org.menu.search.workspace")}
            value={workspaceSearchValue}
            onChange={(event) => {
              setWorkspaceSearchValue(event.target.value);
            }}
            slotProps={{ htmlInput: { "aria-label": t("org.menu.search.workspace") } }}
            sx={{
              "& .MuiInputBase-root": { minHeight: 28 },
              "& .MuiInputBase-input": { py: 0.5, fontSize: 13 },
            }}
          />
        </MenuItem>
        {filteredWorkspaceOptions.map((workspace) => (
          <MenuItem
            key={workspace.id}
            selected={workspace.id === selectedWorkspaceId}
            onClick={() => {
              setSelectedWorkspaceId(workspace.id);
              setWorkspaceMenuAnchorEl(null);
              setWorkspaceSearchValue("");
            }}
          >
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", mr: 1 }}>
              {renderWorkspaceKindIcon(workspace, workspace.id === primaryWorkspaceId, 14)}
            </Box>
            <Typography variant="body2" noWrap>
              {workspace.name}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuPlay } from "react-icons/lu";
import { renderProjectIcon } from "../../components/projectIcons";
import type { WorkspaceNotificationColor } from "../../helpers/workspaceNotification";
import type { WorkspaceItem, WorkspaceProjectRecord } from "../../store/types";
import { MenuSearchField, renderWorkspaceKindIcon } from "./mainPaneTitleBarHelpers";

type RepoSelectorMenuProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  repoSearchValue: string;
  setRepoSearchValue: (value: string) => void;
  filteredRepoOptions: WorkspaceProjectRecord[];
  selectedProjectId: string;
  setSelectedRepoId: (projectId: string) => void;
  setRepoMenuAnchorEl: (value: HTMLElement | null) => void;
  setWorkspaceMenuAnchorEl: (value: HTMLElement | null) => void;
  setWorkspaceSearchValue: (value: string) => void;
  t: (key: string) => string;
};

export function RepoSelectorMenu({
  open,
  anchorEl,
  repoSearchValue,
  setRepoSearchValue,
  filteredRepoOptions,
  selectedProjectId,
  setSelectedRepoId,
  setRepoMenuAnchorEl,
  setWorkspaceMenuAnchorEl,
  setWorkspaceSearchValue,
  t,
}: RepoSelectorMenuProps) {
  return (
    <Menu
      open={open}
      anchorEl={anchorEl}
      onClose={() => {
        setRepoMenuAnchorEl(null);
        setRepoSearchValue("");
      }}
    >
      <MenuSearchField placeholder={t("org.menu.search.repo")} value={repoSearchValue} onChange={setRepoSearchValue} />
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
  );
}

type WorkspaceSelectorMenuProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  workspaceSearchValue: string;
  setWorkspaceSearchValue: (value: string) => void;
  filteredWorkspaceOptions: WorkspaceItem[];
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  setWorkspaceMenuAnchorEl: (value: HTMLElement | null) => void;
  resolveWorkspaceIconColor: (workspaceId: string) => WorkspaceNotificationColor;
  primaryWorkspaceId: string | undefined;
  t: (key: string) => string;
};

export function WorkspaceSelectorMenu({
  open,
  anchorEl,
  workspaceSearchValue,
  setWorkspaceSearchValue,
  filteredWorkspaceOptions,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
  setWorkspaceMenuAnchorEl,
  resolveWorkspaceIconColor,
  primaryWorkspaceId,
  t,
}: WorkspaceSelectorMenuProps) {
  return (
    <Menu
      open={open}
      anchorEl={anchorEl}
      onClose={() => {
        setWorkspaceMenuAnchorEl(null);
        setWorkspaceSearchValue("");
      }}
    >
      <MenuSearchField
        placeholder={t("org.menu.search.workspace")}
        value={workspaceSearchValue}
        onChange={setWorkspaceSearchValue}
      />
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
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              mr: 1,
              color: resolveWorkspaceIconColor(workspace.id),
            }}
          >
            {renderWorkspaceKindIcon(workspace, workspace.id === primaryWorkspaceId, 14)}
          </Box>
          <Typography variant="body2" noWrap>
            {workspace.name}
          </Typography>
        </MenuItem>
      ))}
    </Menu>
  );
}

type ProjectCommand = { name: string; command: string };

type ProjectCommandsMenuProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  projectCommands: ProjectCommand[];
  selectedWorkspaceId: string;
  openTab: (input: {
    workspaceId: string;
    kind: "terminal";
    title: string;
    launchCommand: string;
    reuseExisting: false;
  }) => void;
  terminalTitle: string;
  onOpenAddDialog: () => void;
};

export function ProjectCommandsMenu({
  open,
  anchorEl,
  onClose,
  projectCommands,
  selectedWorkspaceId,
  openTab,
  terminalTitle,
  onOpenAddDialog,
}: ProjectCommandsMenuProps) {
  const { t } = useTranslation();
  return (
    <Menu
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      slotProps={{ paper: { sx: { border: 1, borderColor: "divider" } } }}
    >
      {projectCommands.length === 0 ? (
        <MenuItem disabled>
          <Typography variant="body2" color="text.secondary">
            {t("project.commands.empty")}
          </Typography>
        </MenuItem>
      ) : null}
      {projectCommands.map((projectCommand) => (
        <MenuItem
          key={`${projectCommand.name}:${projectCommand.command}`}
          sx={{ color: "text.primary", "&:hover": { bgcolor: "action.hover" } }}
          onClick={() => {
            if (selectedWorkspaceId) {
              openTab({
                workspaceId: selectedWorkspaceId,
                kind: "terminal",
                title: terminalTitle,
                launchCommand: projectCommand.command,
                reuseExisting: false,
              });
            }
            onClose();
          }}
        >
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", mr: 1, color: "text.secondary" }}>
            <LuPlay size={13} />
          </Box>
          <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>
            {projectCommand.name}
          </Typography>
        </MenuItem>
      ))}
      <Divider />
      <MenuItem sx={{ color: "text.secondary", "&:hover": { bgcolor: "action.hover" } }} onClick={onOpenAddDialog}>
        <Typography variant="body2">{t("project.commands.add")}</Typography>
      </MenuItem>
    </Menu>
  );
}

type AddProjectCommandDialogProps = {
  open: boolean;
  isSaving: boolean;
  commandNameValue: string;
  commandLineValue: string;
  errorMessage: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitDisabled: boolean;
  cancelLabel: string;
};

export function AddProjectCommandDialog({
  open,
  isSaving,
  commandNameValue,
  commandLineValue,
  errorMessage,
  onClose,
  onNameChange,
  onCommandChange,
  onSubmit,
  isSubmitDisabled,
  cancelLabel,
}: AddProjectCommandDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={isSaving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("project.commands.dialogTitle")}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("project.commands.nameLabel")}
          value={commandNameValue}
          disabled={isSaving}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t("project.commands.namePlaceholder")}
          sx={{ mt: 0.5 }}
        />
        <TextField
          fullWidth
          label={t("project.commands.commandLabel")}
          value={commandLineValue}
          disabled={isSaving}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder={t("project.commands.commandPlaceholder")}
          sx={{ mt: 1.5 }}
        />
        {errorMessage ? (
          <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
            {errorMessage}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          {cancelLabel}
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={isSubmitDisabled}>
          {t("project.commands.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

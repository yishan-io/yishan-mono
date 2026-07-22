import {
  Avatar,
  Box,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { BranchDropdown, type BranchDropdownGroups } from "@renderer/components/BranchDropdown";
import { renderProjectIcon } from "@renderer/components/projectIcons";
import type { WorkspaceProjectRecord } from "@renderer/store/types";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuFolderGit2, LuGitBranch } from "react-icons/lu";
import { compactSelectSx } from "../createWorkspaceHelpers";

type ProjectAndSourceBranchSectionProps = {
  isRenameMode: boolean;
  selectableProjects: WorkspaceProjectRecord[];
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
  sourceBranchOptions: string[];
  sourceBranchGroups: BranchDropdownGroups;
  sourceBranchSelectValue: string;
  onSourceBranchChange: (branch: string) => void;
  sourceBranchMenuAnchorEl: HTMLElement | null;
  onSourceBranchMenuOpen: (anchorElement: HTMLElement) => void;
  onSourceBranchMenuClose: () => void;
  isLoadingSourceBranches: boolean;
  isSelectedSourceBranchWorktree: boolean;
};

/** Renders project and source-branch controls for the workspace dialog. */
export function ProjectAndSourceBranchSection({
  isRenameMode,
  selectableProjects,
  selectedProjectId,
  onProjectChange,
  sourceBranchOptions,
  sourceBranchGroups,
  sourceBranchSelectValue,
  onSourceBranchChange,
  sourceBranchMenuAnchorEl,
  onSourceBranchMenuOpen,
  onSourceBranchMenuClose,
  isLoadingSourceBranches,
  isSelectedSourceBranchWorktree,
}: ProjectAndSourceBranchSectionProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isSourceBranchMenuOpen = Boolean(sourceBranchMenuAnchorEl);

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          Project
        </Typography>
        <TextField
          select
          fullWidth
          value={selectedProjectId}
          onChange={(event) => onProjectChange(event.target.value)}
          sx={compactSelectSx}
          disabled={isRenameMode}
          slotProps={{
            select: {
              displayEmpty: true,
              autoWidth: false,
              MenuProps: {
                slotProps: {
                  paper: {
                    sx: {
                      width: "250px !important",
                      minWidth: "250px !important",
                      maxWidth: "250px !important",
                    },
                  },
                  list: {
                    sx: {
                      width: "250px",
                    },
                  },
                },
                PaperProps: {
                  sx: {
                    width: "250px !important",
                    minWidth: "250px !important",
                    maxWidth: "250px !important",
                  },
                },
              },
              renderValue: (value) => {
                const selectedValue = typeof value === "string" ? value : "";
                const selectedProject = selectableProjects.find((project) => project.id === selectedValue);
                const projectColor = selectedProject?.color ?? theme.palette.primary.main;

                return (
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: 20,
                        height: 20,
                        bgcolor: projectColor,
                        color: theme.palette.getContrastText(projectColor),
                      }}
                    >
                      {renderProjectIcon(selectedProject?.icon ?? undefined, 12)}
                    </Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {selectedProject?.name ?? t("project.unknown")}
                    </Typography>
                  </Stack>
                );
              },
            },
          }}
        >
          {selectableProjects.map((project) => {
            const projectColor = project.color ?? theme.palette.primary.main;

            return (
              <MenuItem key={project.id} value={project.id}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Avatar
                    variant="rounded"
                    sx={{
                      width: 20,
                      height: 20,
                      bgcolor: projectColor,
                      color: theme.palette.getContrastText(projectColor),
                    }}
                  >
                    {renderProjectIcon(project.icon ?? undefined, 12)}
                  </Avatar>
                  <Typography variant="body2">{project.name}</Typography>
                </Stack>
              </MenuItem>
            );
          })}
        </TextField>
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          Source branch
        </Typography>
        <TextField
          fullWidth
          value={sourceBranchSelectValue}
          onClick={(event) => {
            if (isRenameMode || !selectedProjectId || sourceBranchOptions.length === 0) {
              return;
            }
            onSourceBranchMenuOpen(event.currentTarget);
          }}
          sx={compactSelectSx}
          InputProps={{
            readOnly: true,
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.75 }}>
                {isSelectedSourceBranchWorktree ? (
                  <LuFolderGit2 size={14} color="currentColor" />
                ) : (
                  <LuGitBranch size={14} color="currentColor" />
                )}
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end" sx={{ ml: 0.5, color: "text.secondary" }}>
                {isLoadingSourceBranches ? <CircularProgress size={14} /> : <LuChevronDown size={16} />}
              </InputAdornment>
            ),
          }}
          placeholder="Source branch"
          disabled={isRenameMode || !selectedProjectId || sourceBranchOptions.length === 0}
        />
        <Popover
          open={isSourceBranchMenuOpen}
          anchorEl={sourceBranchMenuAnchorEl}
          onClose={onSourceBranchMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          disableRestoreFocus
          slotProps={{
            paper: {
              sx: {
                minWidth: 250,
                maxWidth: 350,
                mt: 0.5,
              },
            },
          }}
        >
          {isLoadingSourceBranches ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 3, px: 2, gap: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                Loading branches…
              </Typography>
            </Box>
          ) : (
            <BranchDropdown
              groups={sourceBranchGroups}
              selectedValue={sourceBranchSelectValue}
              onSelect={(value) => onSourceBranchChange(value)}
              localLabel="Local"
              branchesLabel="Branches"
              worktreesLabel="Worktrees"
              remoteLabel="Remote"
              emptyLocalLabel="No local branches"
              emptyWorktreeLabel="No worktree branches"
              emptyRemoteLabel="No remote branches"
            />
          )}
        </Popover>
      </Box>
    </Stack>
  );
}

import {
  ButtonGroup,
  Box,
  Button,
  Checkbox,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineFilterList } from "react-icons/md";
import { useCommands } from "../../../hooks/useCommands";
import { workspaceStore } from "../../../store/workspaceStore";

/** Returns true when a repository row matches the quick-search keyword. */
function repoMatchesQuickSearch(repoName: string, repoPath: string, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }

  return repoName.toLowerCase().includes(normalizedKeyword) || repoPath.toLowerCase().includes(normalizedKeyword);
}

/** Renders the repo filter trigger and popover with select-all control and quick search. */
export function ProjectFilterPopoverView() {
  const { t } = useTranslation();
  const repos = workspaceStore((state) => state.projects);
  const displayRepoIds = workspaceStore((state) => state.displayProjectIds);
  const { setDisplayRepoIds } = useCommands();
  const [repoFilterAnchor, setRepoFilterAnchor] = useState<HTMLElement | null>(null);
  const [repoQuickSearch, setRepoQuickSearch] = useState("");
  const workspaceListHierarchyMode = workspaceStore((state) => state.workspaceListHierarchyMode);
  const setWorkspaceListHierarchyMode = workspaceStore((state) => state.setWorkspaceListHierarchyMode);

  const handleSelectAll = () => {
    setDisplayRepoIds(repos.map((repo) => repo.id));
  };

  return (
    <>
      <Tooltip title={t("project.actions.filter")} arrow>
        <IconButton
          size="small"
          aria-label={t("project.actions.filter")}
          onClick={(event) => setRepoFilterAnchor(event.currentTarget)}
        >
          <MdOutlineFilterList size={15} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(repoFilterAnchor)}
        anchorEl={repoFilterAnchor}
        onClose={() => {
          setRepoFilterAnchor(null);
          setRepoQuickSearch("");
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            style: {
              backgroundImage: "none",
            },
            sx: {
              mt: 1,
              overflow: "visible",
              border: (theme) => `1px solid ${theme.palette.divider}`,
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                right: 16,
                width: 10,
                height: 10,
                bgcolor: "background.default",
                backgroundImage: "none",
                transform: "translateY(-50%) rotate(45deg)",
                zIndex: 0,
                boxShadow: (theme) => `-1px -1px 0 0 ${theme.palette.divider}`,
              },
            },
          },
        }}
      >
        <Box sx={{ width: 240, p: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            {t("project.filter.sections.hirarchy")}
          </Typography>
          <ButtonGroup size="small" fullWidth sx={{ mb: 1 }}>
            <Button
              variant={workspaceListHierarchyMode === "by_project" ? "contained" : "outlined"}
              sx={{ fontSize: 11, textTransform: "none" }}
              onClick={() => setWorkspaceListHierarchyMode("by_project")}
            >
              {t("project.filter.hierarchy.byProject")}
            </Button>
            <Button
              variant={workspaceListHierarchyMode === "by_node" ? "contained" : "outlined"}
              sx={{ fontSize: 11, textTransform: "none" }}
              onClick={() => setWorkspaceListHierarchyMode("by_node")}
            >
              {t("project.filter.hierarchy.byNode")}
            </Button>
          </ButtonGroup>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t("project.filter.sections.projects")}
            </Typography>
            <Button size="small" sx={{ minWidth: 0, px: 0.75, py: 0.25, fontSize: 11 }} onClick={handleSelectAll}>
              {t("project.filter.actions.all")}
            </Button>
          </Stack>
          <TextField
            value={repoQuickSearch}
            size="small"
            fullWidth
            autoFocus
            placeholder={t("project.filter.searchPlaceholder")}
            onChange={(event) => setRepoQuickSearch(event.target.value)}
            sx={{
              "& .MuiInputBase-root": {
                minHeight: 28,
              },
              "& .MuiInputBase-input": {
                fontSize: 12,
                py: 0.5,
              },
            }}
            slotProps={{
              htmlInput: {
                "aria-label": t("project.filter.searchAriaLabel"),
              },
            }}
          />
          <List dense disablePadding sx={{ mt: 1, maxHeight: 260, overflowY: "auto" }}>
            {repos
              .filter((repo) =>
                repoMatchesQuickSearch(
                  repo.name,
                  repo.path ?? repo.localPath ?? repo.worktreePath ?? "",
                  repoQuickSearch,
                ),
              )
              .map((repo) => {
                const checked = displayRepoIds.includes(repo.id);
                const isLastSelected = checked && displayRepoIds.length === 1;

                return (
                  <ListItem key={repo.id} disablePadding>
                    <ListItemButton
                      disabled={isLastSelected}
                      onClick={() => {
                        if (isLastSelected) {
                          return;
                        }
                        const nextDisplayRepoIds = displayRepoIds.includes(repo.id)
                          ? displayRepoIds.filter((item) => item !== repo.id)
                          : [...displayRepoIds, repo.id];
                        setDisplayRepoIds(nextDisplayRepoIds);
                      }}
                      sx={{ py: 0, px: 0.5, minHeight: 28 }}
                    >
                      <Checkbox
                        size="small"
                        checked={checked}
                        disabled={isLastSelected}
                        tabIndex={-1}
                        disableRipple
                        sx={{ p: 0.5, mr: 0.5, "& .MuiSvgIcon-root": { fontSize: 18 } }}
                      />
                      <ListItemText primary={repo.name} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
          </List>
        </Box>
      </Popover>
    </>
  );
}

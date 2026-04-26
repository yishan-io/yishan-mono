import { Avatar, Box, IconButton, ListItem, ListItemButton, Tooltip, Typography, useTheme } from "@mui/material";
import type { MouseEvent as ReactMouseEvent } from "react";
import { LuChevronDown, LuChevronRight, LuPlus } from "react-icons/lu";
import type { WorkspaceProjectRecord } from "../store/types";
import { renderProjectIcon } from "./projectIcons";

type ProjectRowProps = {
  repo: WorkspaceProjectRecord;
  isSelected: boolean;
  isFolded: boolean;
  addWorkspaceAriaLabel: string;
  addWorkspaceTooltipLabel: string;
  foldToggleAriaLabel: string;
  onSelect: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onAddWorkspace: (event: ReactMouseEvent<HTMLElement>) => void;
  onToggleFold: (event: ReactMouseEvent<HTMLElement>) => void;
};

/** Renders one repository row with quick actions and fold toggle. */
export function ProjectRow({
  repo,
  isSelected,
  isFolded,
  addWorkspaceAriaLabel,
  addWorkspaceTooltipLabel,
  foldToggleAriaLabel,
  onSelect,
  onContextMenu,
  onAddWorkspace,
  onToggleFold,
}: ProjectRowProps) {
  const theme = useTheme();

  return (
    <ListItem disablePadding>
      <ListItemButton
        selected={isSelected}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        sx={{
          pl: 2,
          pr: 1.5,
          py: 0.5,
          "& .repo-actions": {
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 0.15s ease",
          },
          "&:hover .repo-actions, &:focus-visible .repo-actions, &.Mui-selected .repo-actions": {
            opacity: 1,
            pointerEvents: "auto",
          },
        }}
      >
        <Box sx={{ display: "flex", gap: 1, width: "100%", alignItems: "center" }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 20,
              height: 20,
              bgcolor: repo.iconBgColor ?? theme.palette.primary.main,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {renderProjectIcon(repo.icon, 12)}
          </Avatar>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {repo.name}
            </Typography>
          </Box>
          <Box
            className="repo-actions"
            sx={{
              display: "flex",
              gap: 0.25,
              alignSelf: "flex-start",
              opacity: isSelected ? 1 : undefined,
              pointerEvents: isSelected ? "auto" : undefined,
            }}
          >
            <Tooltip title={addWorkspaceTooltipLabel} arrow>
              <IconButton size="small" aria-label={addWorkspaceAriaLabel} onClick={onAddWorkspace}>
                <LuPlus size={15} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" aria-label={foldToggleAriaLabel} onClick={onToggleFold}>
              {isFolded ? <LuChevronRight size={18} /> : <LuChevronDown size={18} />}
            </IconButton>
          </Box>
        </Box>
      </ListItemButton>
    </ListItem>
  );
}

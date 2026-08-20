import { Box, useTheme } from "@mui/material";
import { resolveWorkspaceNotificationColor } from "@renderer/domains/notification";
import { renderProjectIcon } from "@renderer/domains/project";
import { CgSpinner } from "react-icons/cg";
import { HiCubeTransparent, HiOutlineCube } from "react-icons/hi2";
import { LuCloud, LuFolder, LuFolderOpen, LuLaptop, LuServer } from "react-icons/lu";
import { CliSpinner } from "../../../../ui/components/CliSpinner";
import type { WorkspaceTreeRow } from "./types";

type WorkspaceTreeRowIconProps = {
  row: WorkspaceTreeRow;
  isExpanded: boolean;
  workspaceId: string;
};

/** Render the icon and status indicator for a workspace tree row. */
export function WorkspaceTreeRowIcon({ row, isExpanded, workspaceId }: WorkspaceTreeRowIconProps) {
  const theme = useTheme();
  const isFolderLike = row.kind !== "workspace";
  const workspaceIconColor = resolveWorkspaceNotificationColor(row.notificationTone ?? "none");

  if (row.kind === "project") {
    if (row.isLocalFolderGroup) {
      return (
        <Box
          component="span"
          sx={{
            width: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "text.secondary",
          }}
        >
          {isExpanded ? <LuFolderOpen size={16} /> : <LuFolder size={16} />}
        </Box>
      );
    }

    return (
      <Box
        component="span"
        sx={{
          width: 20,
          height: 20,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: row.color ?? theme.palette.primary.main,
          color: theme.palette.common.white,
          fontSize: 12,
          fontWeight: 700,
          borderRadius: 0.5,
        }}
      >
        {renderProjectIcon(row.icon ?? undefined, 12)}
      </Box>
    );
  }

  if (row.kind === "node") {
    return (
      <Box component="span" sx={{ width: 16, height: 16, display: "inline-flex", color: "text.secondary" }}>
        {row.nodeKind === "managed" ? (
          <LuLaptop size={16} />
        ) : row.nodeScope === "shared" ? (
          <LuCloud size={16} />
        ) : (
          <LuServer size={16} />
        )}
      </Box>
    );
  }

  if (row.kind === "workspace") {
    return (
      <Box component="span" sx={{ width: 16, height: 16, display: "inline-flex", color: workspaceIconColor }}>
        {row.isCreating ? (
          <Box
            component="span"
            data-testid={`workspace-creating-spinner-${workspaceId}`}
            sx={{
              display: "inline-flex",
              "@keyframes workspace-creating-spin": {
                from: { transform: "rotate(0deg)" },
                to: { transform: "rotate(360deg)" },
              },
              animation: "workspace-creating-spin 1s linear infinite",
            }}
          >
            <CgSpinner size={16} />
          </Box>
        ) : row.isLocalFolder ? (
          <LuFolder size={16} data-testid={`workspace-folder-icon-${workspaceId}`} />
        ) : row.runtimeStatus === "running" ? (
          <Box component="span" data-testid={`workspace-status-running-spinner-${workspaceId}`}>
            <CliSpinner fontSize={20} />
          </Box>
        ) : row.workspaceKind === "local" ? (
          <HiOutlineCube
            size={16}
            data-testid={
              row.notificationTone === "waiting_input"
                ? `workspace-status-waiting-input-badge-${workspaceId}`
                : row.notificationTone === "done"
                  ? `workspace-status-done-badge-${workspaceId}`
                  : row.notificationTone === "failed"
                    ? `workspace-status-failed-badge-${workspaceId}`
                    : `workspace-kind-local-${workspaceId}`
            }
          />
        ) : (
          <HiCubeTransparent
            size={16}
            data-testid={
              row.notificationTone === "waiting_input"
                ? `workspace-status-waiting-input-badge-${workspaceId}`
                : row.notificationTone === "done"
                  ? `workspace-status-done-badge-${workspaceId}`
                  : row.notificationTone === "failed"
                    ? `workspace-status-failed-badge-${workspaceId}`
                    : `workspace-icon-${workspaceId}`
            }
          />
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ width: 16, height: 16, color: row.kind === "workspace" ? "text.secondary" : "primary.main" }}>
      {isFolderLike && isExpanded ? <LuFolderOpen size={16} /> : <LuFolder size={16} />}
    </Box>
  );
}

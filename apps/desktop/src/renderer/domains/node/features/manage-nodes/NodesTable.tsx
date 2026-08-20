import { IconButton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import { StatusIndicator } from "@renderer/ui/components/StatusIndicator";
import { useTranslation } from "react-i18next";
import { LuArrowLeftRight, LuTrash2 } from "react-icons/lu";
import type { OrganizationMemberRecord } from "@renderer/domains/organization";
import type { NodeRecord } from "../../api/types";
import {
  resolveNodeKindLabel,
  resolveNodeTypeLabel,
  resolveNodeVersion,
  resolveOwnerLabel,
} from "./nodeLabelResolvers";

export type NodesTableProps = {
  nodes: NodeRecord[];
  members: OrganizationMemberRecord[];
  canChangeScope: (node: NodeRecord) => boolean;
  canUnregister: (node: NodeRecord) => boolean;
  onScopeChangeRequest: (node: NodeRecord) => void;
  onUnregisterRequest: (node: NodeRecord) => void;
};

/** Renders the organization nodes table with scope/unregister row actions. */
export function NodesTable({
  nodes,
  members,
  canChangeScope,
  canUnregister,
  onScopeChangeRequest,
  onUnregisterRequest,
}: NodesTableProps) {
  const { t } = useTranslation();

  return (
    <Table
      size="small"
      sx={{
        "& th": {
          fontWeight: 600,
          borderBottomColor: "divider",
        },
        "& th, & td": {
          borderBottomColor: "divider",
        },
        "& tbody tr:last-of-type td": {
          borderBottom: "none",
        },
      }}
    >
      <TableHead>
        <TableRow>
          <TableCell>{t("settings.nodes.columns.name")}</TableCell>
          <TableCell>{t("settings.nodes.columns.type")}</TableCell>
          <TableCell>{t("settings.nodes.columns.kind")}</TableCell>
          <TableCell>{t("settings.nodes.columns.version")}</TableCell>
          <TableCell>{t("settings.nodes.columns.owner")}</TableCell>
          <TableCell>{t("settings.nodes.columns.status")}</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {nodes.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7}>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  py: 1,
                }}
              >
                {t("settings.nodes.empty")}
              </Typography>
            </TableCell>
          </TableRow>
        ) : (
          nodes.map((node) => (
            <TableRow key={node.id}>
              <TableCell>{node.name}</TableCell>
              <TableCell>
                {resolveNodeTypeLabel(node, t("settings.nodes.types.private"), t("settings.nodes.types.shared"))}
              </TableCell>
              <TableCell>
                {resolveNodeKindLabel(node, t("settings.nodes.kinds.managed"), t("settings.nodes.kinds.external"))}
              </TableCell>
              <TableCell>{resolveNodeVersion(node, t("settings.nodes.values.unknownVersion"))}</TableCell>
              <TableCell>{resolveOwnerLabel(node, members, t("settings.nodes.values.unknownOwner"))}</TableCell>
              <TableCell>
                <StatusIndicator
                  label={node.isOnline ? t("settings.nodes.status.online") : t("settings.nodes.status.offline")}
                  color={node.isOnline ? "success" : "disabled"}
                />
              </TableCell>
              <TableCell align="right" sx={{ pr: 0.5 }}>
                {canChangeScope(node) ? (
                  <Tooltip
                    title={
                      node.scope === "private"
                        ? t("settings.nodes.actions.makeShared")
                        : t("settings.nodes.actions.makePrivate")
                    }
                  >
                    <IconButton
                      onClick={() => onScopeChangeRequest(node)}
                      aria-label={
                        node.scope === "private"
                          ? t("settings.nodes.actions.makeShared")
                          : t("settings.nodes.actions.makePrivate")
                      }
                    >
                      <LuArrowLeftRight size={14} />
                    </IconButton>
                  </Tooltip>
                ) : null}
                {canUnregister(node) ? (
                  <Tooltip title={t("settings.nodes.actions.unregister")}>
                    <IconButton
                      color="error"
                      onClick={() => onUnregisterRequest(node)}
                      aria-label={t("settings.nodes.actions.unregister")}
                    >
                      <LuTrash2 size={14} />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

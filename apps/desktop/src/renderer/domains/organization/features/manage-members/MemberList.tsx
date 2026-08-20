import {
  Alert,
  Avatar,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";

import { CenteredSpinner } from "../../../../ui/components/CenteredSpinner";
import type { OrganizationMemberRecord } from "../../api/orgApi";

interface MemberListProps {
  isLoading: boolean;
  hasLoadError: boolean;
  members: OrganizationMemberRecord[];
  canManageMembers: boolean;
  onRemoveRequest: (member: OrganizationMemberRecord) => void;
}

function getMemberInitials(member: OrganizationMemberRecord): string {
  const displayName = member.name?.trim() || member.email?.trim() || member.userId.trim();
  if (!displayName) {
    return "U";
  }

  return displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Renders the organization member table and its load states. */
export function MemberList({ isLoading, hasLoadError, members, canManageMembers, onRemoveRequest }: MemberListProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <CenteredSpinner />;
  }

  return (
    <>
      {hasLoadError ? <Alert severity="error">{t("settings.members.loadError")}</Alert> : null}
      <Table
        size="small"
        sx={{
          mt: hasLoadError ? 1.5 : 0,
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
            <TableCell>{t("settings.members.columns.member")}</TableCell>
            <TableCell>{t("settings.members.columns.email")}</TableCell>
            <TableCell>{t("settings.members.columns.role")}</TableCell>
            <TableCell>{t("settings.members.columns.userId")}</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    py: 1,
                  }}
                >
                  {t("settings.members.empty")}
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            members.map((member) => {
              const displayName = member.name?.trim() || member.email;
              const avatarAlt = displayName || member.userId;
              const isOwnerMember = member.role === "owner";
              const canRemoveMember = canManageMembers && !isOwnerMember;

              return (
                <TableRow key={member.userId}>
                  <TableCell>
                    <Stack
                      direction="row"
                      spacing={1.25}
                      sx={{
                        alignItems: "center",
                        minWidth: 0,
                      }}
                    >
                      <Avatar
                        src={member.avatarUrl ?? undefined}
                        alt={avatarAlt}
                        sx={{ width: 28, height: 28, fontSize: 12 }}
                      >
                        {getMemberInitials(member)}
                      </Avatar>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {displayName}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {member.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{member.role}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      {member.userId}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 0.5 }}>
                    {canRemoveMember ? (
                      <IconButton
                        onClick={() => onRemoveRequest(member)}
                        aria-label={t("settings.members.removeAriaLabel")}
                      >
                        <BiTrash />
                      </IconButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </>
  );
}

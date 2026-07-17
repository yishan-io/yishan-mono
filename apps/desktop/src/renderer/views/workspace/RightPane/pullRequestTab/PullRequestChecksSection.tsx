import { Box, Link, Stack, Typography } from "@mui/material";
import { openLink } from "@renderer/commands/appCommands";
import type { DaemonWorkspacePullRequestCheck } from "@renderer/rpc/daemonTypes";
import { useTranslation } from "react-i18next";
import { LuCheck, LuCircleDashed, LuX } from "react-icons/lu";

interface PullRequestChecksSectionProps {
  checks: DaemonWorkspacePullRequestCheck[];
}

function CheckStateIcon({ state }: { state: string }) {
  const normalizedState = state.toUpperCase();

  if (normalizedState === "SUCCESS") {
    return <LuCheck size={14} color="#16a34a" />;
  }

  if (["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(normalizedState)) {
    return <LuX size={14} color="#dc2626" />;
  }

  return <LuCircleDashed size={14} color="#71717a" />;
}

/** Renders live pull request checks. */
export default function PullRequestChecksSection({ checks }: PullRequestChecksSectionProps) {
  const { t } = useTranslation();

  if (checks.length === 0) {
    return null;
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t("workspace.pr.checks")}</Typography>
      {checks.map((check) => (
        <Stack key={`${check.workflow ?? ""}:${check.name}`} direction="row" spacing={1} alignItems="center">
          <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            <CheckStateIcon state={check.state} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {check.url ? (
              <Link
                component="button"
                type="button"
                underline="hover"
                variant="body2"
                onClick={() => void openLink({ url: check.url ?? "" })}
                sx={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  color: "text.primary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {check.workflow ? `${check.workflow} / ${check.name}` : check.name}
              </Link>
            ) : (
              <Typography variant="body2" noWrap>
                {check.workflow ? `${check.workflow} / ${check.name}` : check.name}
              </Typography>
            )}
            {check.description ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {check.description}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

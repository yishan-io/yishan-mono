import { Box, Link, Stack, Typography } from "@mui/material";
import { openLink } from "@renderer/domains/browser";
import { useTranslation } from "react-i18next";
import { LuCheck, LuCircleDashed, LuX } from "react-icons/lu";
import type { GitPullRequestCheck } from "../../pull-request/gitPullRequestTypes";

interface PullRequestChecksSectionProps {
  checks: GitPullRequestCheck[];
}

const checkStateIcons = {
  success: LuCheck,
  failure: LuX,
  pending: LuCircleDashed,
};

type CheckStatePresentation = {
  icon: keyof typeof checkStateIcons;
  color: "success.main" | "error.main" | "text.secondary";
};

/** Maps a pull-request check state to its icon and semantic color token. */
export function getCheckStatePresentation(state: string): CheckStatePresentation {
  const normalizedState = state.toUpperCase();

  if (normalizedState === "SUCCESS") {
    return { icon: "success", color: "success.main" };
  }

  if (["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"].includes(normalizedState)) {
    return { icon: "failure", color: "error.main" };
  }

  return { icon: "pending", color: "text.secondary" };
}

function CheckStateIcon({ state }: { state: string }) {
  const presentation = getCheckStatePresentation(state);
  const Icon = checkStateIcons[presentation.icon];

  return (
    <Box sx={{ color: presentation.color }}>
      <Icon size={14} />
    </Box>
  );
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
        <Stack
          key={`${check.workflow ?? ""}:${check.name}`}
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
          }}
        >
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
              <Typography
                variant="caption"
                noWrap
                sx={{
                  color: "text.secondary",
                }}
              >
                {check.description}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

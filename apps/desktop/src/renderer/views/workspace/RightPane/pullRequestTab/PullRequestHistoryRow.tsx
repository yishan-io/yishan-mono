import { Box, Chip, Link, Stack, Typography } from "@mui/material";
import type { WorkspacePullRequestRecord } from "@renderer/api/types";
import { openLink } from "@renderer/commands/appCommands";
import { BranchBadge } from "@renderer/components/BranchBadge";
import { PullRequestIcon } from "@renderer/components/PullRequestIcon";
import { useTranslation } from "react-i18next";
import { LuArrowRight } from "react-icons/lu";

interface PullRequestHistoryRowProps {
  pr: WorkspacePullRequestRecord;
}

/** Renders one historical pull request row. */
export default function PullRequestHistoryRow({ pr }: PullRequestHistoryRowProps) {
  const { t } = useTranslation();
  const isDraft = (pr.metadata as Record<string, unknown> | null)?.isDraft as boolean | undefined;

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <PullRequestIcon state={pr.state} isDraft={isDraft} size={15} />
        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
          #{pr.prId}
          {pr.title ? ` ${pr.title}` : ""}
        </Typography>
        <Chip size="small" label={pr.state} variant="outlined" sx={{ flexShrink: 0, fontSize: 11, height: 20 }} />
      </Stack>
      {pr.branch || pr.baseBranch ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, overflow: "hidden" }}>
          <BranchBadge name={pr.branch || t("workspace.info.unavailable")} />
          <Box sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
            <LuArrowRight size={13} color="currentColor" />
          </Box>
          <BranchBadge name={pr.baseBranch || t("workspace.info.unavailable")} />
        </Box>
      ) : null}
      {pr.url ? (
        <Link
          component="button"
          type="button"
          underline="hover"
          variant="caption"
          onClick={() => void openLink({ url: pr.url ?? "" })}
          sx={{ alignSelf: "flex-start" }}
        >
          {t("workspace.pr.viewDetails")}
        </Link>
      ) : null}
    </Stack>
  );
}

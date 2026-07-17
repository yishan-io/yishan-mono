import { Divider, Stack, Typography } from "@mui/material";
import type { WorkspacePullRequestRecord } from "@renderer/api/types";
import { useTranslation } from "react-i18next";
import PullRequestHistoryRow from "./PullRequestHistoryRow";

interface PullRequestHistorySectionProps {
  pastPullRequests: WorkspacePullRequestRecord[];
  showTopDivider: boolean;
}

/** Renders historical pull request entries. */
export default function PullRequestHistorySection({
  pastPullRequests,
  showTopDivider,
}: PullRequestHistorySectionProps) {
  const { t } = useTranslation();

  if (pastPullRequests.length === 0) {
    return null;
  }

  return (
    <>
      {showTopDivider ? <Divider /> : null}
      <Stack spacing={0.5}>
        <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
          {t("workspace.pr.history")}
        </Typography>
      </Stack>
      <Stack spacing={1.5} divider={<Divider />}>
        {pastPullRequests.map((pr) => (
          <PullRequestHistoryRow key={pr.id} pr={pr} />
        ))}
      </Stack>
    </>
  );
}

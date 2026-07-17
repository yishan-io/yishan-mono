import { Box, Chip, Divider, Link, Stack, Typography } from "@mui/material";
import { openLink } from "@renderer/commands/appCommands";
import type { DaemonWorkspacePullRequestDeployment } from "@renderer/rpc/daemonTypes";
import { useTranslation } from "react-i18next";

interface PullRequestDeploymentsSectionProps {
  deployments: DaemonWorkspacePullRequestDeployment[];
}

/** Renders live pull request deployments. */
export default function PullRequestDeploymentsSection({ deployments }: PullRequestDeploymentsSectionProps) {
  const { t } = useTranslation();

  if (deployments.length === 0) {
    return null;
  }

  return (
    <>
      <Divider />
      <Stack spacing={1}>
        <Typography variant="subtitle2">{t("workspace.pr.deployments")}</Typography>
        {deployments.map((deployment) => (
          <Stack key={deployment.id} direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={deployment.state || t("workspace.info.unavailable")} variant="outlined" />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap>
                {deployment.environment || t("workspace.info.unavailable")}
              </Typography>
              {deployment.description ? (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {deployment.description}
                </Typography>
              ) : null}
            </Box>
            {deployment.environmentUrl ? (
              <Link
                component="button"
                type="button"
                underline="hover"
                variant="caption"
                onClick={() => void openLink({ url: deployment.environmentUrl ?? "" })}
                sx={{ flexShrink: 0 }}
              >
                {t("workspace.pr.open")}
              </Link>
            ) : null}
          </Stack>
        ))}
      </Stack>
    </>
  );
}

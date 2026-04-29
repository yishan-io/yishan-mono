import { Box, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuFolderGit2 } from "react-icons/lu";
import { sessionStore } from "../../store/sessionStore";
import { AppMenuView } from "../layout/AppMenuView";
import { CreateProjectFormView } from "./LeftPane/CreateProjectFormView";

/** Renders the first-run project creation view for organizations without projects. */
export function OnboardingView() {
  const { t } = useTranslation();
  const organizations = sessionStore((state) => state.organizations);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        component="header"
        className="electron-webkit-app-region-drag"
        sx={{
          height: 42,
          minHeight: 42,
          px: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box className="electron-webkit-app-region-no-drag">
          <AppMenuView iconOnly />
        </Box>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          px: { xs: 2, sm: 3 },
          py: { xs: 3, sm: 5 },
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "min(100%, 560px)",
            p: { xs: 2.5, sm: 4 },
            border: 1,
            borderColor: "divider",
            borderRadius: 3,
            bgcolor: "background.paper",
          }}
        >
          <Stack spacing={3}>
            <Stack spacing={1.25} alignItems="center" textAlign="center">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  color: "primary.main",
                  bgcolor: "primary.main",
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.main}22, ${theme.palette.primary.main}08)`,
                }}
              >
                <LuFolderGit2 size={24} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 650 }}>
                  {t("onboarding.firstProject.title")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {t("onboarding.firstProject.description", {
                    organizationName: selectedOrganization?.name ?? t("org.defaultWorkspaceName"),
                  })}
                </Typography>
              </Box>
            </Stack>
            <CreateProjectFormView
              onCreated={() => undefined}
              submitLabel={t("onboarding.firstProject.submit")}
              autoFocus={false}
            />
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}

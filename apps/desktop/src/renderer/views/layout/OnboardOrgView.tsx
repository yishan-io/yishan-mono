import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBuilding2 } from "react-icons/lu";
import { createOrganization } from "../../api";
import { rendererQueryClient } from "../../queryClient";
import { sessionStore } from "../../store/sessionStore";
import { AppMenuView } from "./AppMenuView";

/** Renders the required first-organization setup for signed-in users without organizations. */
export function OnboardOrgView() {
  const { t } = useTranslation();
  const [organizationName, setOrganizationName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = () => {
    const normalizedOrganizationName = organizationName.trim();
    if (!normalizedOrganizationName || isCreating) {
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const createdOrganization = await createOrganization(normalizedOrganizationName);
        const currentUser = sessionStore.getState().currentUser;

        sessionStore.getState().setSessionData({
          currentUser,
          organizations: [createdOrganization],
          selectedOrganizationId: createdOrganization.id,
        });

        // Invalidate the cached session-bootstrap query so any subsequent
        // re-bootstrap fetches fresh data instead of the stale pre-creation
        // response that contained an empty organization list.
        rendererQueryClient.invalidateQueries({ queryKey: ["session-bootstrap"] });

        setOrganizationName("");
      } catch {
        setErrorMessage(t("org.menu.newOrganizationFailed"));
      } finally {
        setIsCreating(false);
      }
    })();
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
            width: "min(100%, 480px)",
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
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.main}22, ${theme.palette.primary.main}08)`,
                }}
              >
                <LuBuilding2 size={24} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 650 }}>
                  {t("onboarding.firstOrganization.title")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {t("onboarding.firstOrganization.description")}
                </Typography>
              </Box>
            </Stack>
            <Stack spacing={1.5}>
              <TextField
                autoFocus
                fullWidth
                placeholder={t("org.menu.newOrganizationPrompt")}
                slotProps={{ htmlInput: { "aria-label": t("org.menu.newOrganizationPrompt") } }}
                value={organizationName}
                onChange={(event) => {
                  setOrganizationName(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  }
                }}
                disabled={isCreating}
              />
              {errorMessage ? (
                <Typography variant="caption" color="error">
                  {errorMessage}
                </Typography>
              ) : null}
              <Button variant="contained" onClick={submit} disabled={!organizationName.trim() || isCreating}>
                {isCreating ? t("onboarding.firstOrganization.creating") : t("onboarding.firstOrganization.submit")}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}

import { Box, Button, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { KeybindingTable } from "../../../components/KeybindingDisplay";
import { getSupportedKeyBindings } from "../../../shortcuts/keybindings";
import { keybindingSettingsStore } from "../../../features/settings/state/keybindingSettingsStore";

const WORKSPACE_ROUTE = "/";

export function KeyBindingsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const overridesById = keybindingSettingsStore((state) => state.overridesById);
  const supportedKeyBindings = useMemo(() => getSupportedKeyBindings(overridesById), [overridesById]);

  return (
    <Box
      sx={{
        height: "100%",
        px: { xs: 1.5, md: 3 },
        py: { xs: 2, md: 3 },
        overflowY: "auto",
      }}
    >
      <Stack spacing={2.5} sx={{ maxWidth: 920, mx: "auto" }}>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="h6">{t("keybindings.title")}</Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              {t("keybindings.subtitle")}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={() => navigate(WORKSPACE_ROUTE)}>
            {t("keybindings.back")}
          </Button>
        </Stack>

        <KeybindingTable
          bindings={supportedKeyBindings}
          actionColumnLabel={t("keybindings.columns.action")}
          keyColumnLabel={t("keybindings.columns.current")}
        />
      </Stack>
    </Box>
  );
}

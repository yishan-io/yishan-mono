import { Box, IconButton, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuArrowLeft } from "react-icons/lu";

type WorkspaceTaskDetailHeaderProps = {
  onBack: () => void;
};

/** Renders navigation for the workspace task detail pane. */
export function WorkspaceTaskDetailHeader({ onBack }: WorkspaceTaskDetailHeaderProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
      <Tooltip title={t("common.actions.back")}>
        <IconButton size="small" aria-label={t("common.actions.back")} onClick={onBack}>
          <LuArrowLeft size={17} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

import { IconButton, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { isDaemonVersionOutdated } from "../../helpers/versionHelpers";
import { sessionStore } from "../../store/sessionStore";

/** Renders a warning icon button in the header bar when the daemon version is outdated. */
export function DaemonVersionWarningControl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const daemonVersion = sessionStore((state) => state.daemonVersion);
  const appVersion = sessionStore((state) => state.appVersion);
  const isDaemonOutdated = isDaemonVersionOutdated({ daemonVersion, appVersion });

  if (!isDaemonOutdated) {
    return null;
  }

  const tooltipTitle = t("daemon.version.outdatedMessage", {
    daemonVersion: daemonVersion ?? t("settings.daemon.values.unknown"),
    appVersion: appVersion ?? t("settings.daemon.values.unknown"),
  });

  return (
    <Tooltip arrow placement="bottom" title={tooltipTitle}>
      <IconButton
        size="small"
        color="warning"
        aria-label={tooltipTitle}
        onClick={() => navigate("/settings?tab=daemon")}
      >
        <LuTriangleAlert size={14} />
      </IconButton>
    </Tooltip>
  );
}

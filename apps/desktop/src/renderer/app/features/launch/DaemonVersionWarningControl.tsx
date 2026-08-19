import { IconButton, Tooltip } from "@mui/material";
import { isDaemonVersionOutdated } from "@shared/version/version";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { sessionStore } from "@renderer/domains/session";


/** Renders a warning icon button in the header bar when the daemon version is outdated. */
export function DaemonVersionWarningControl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { daemonVersion, appVersion } = sessionStore(
    useShallow((state) => ({ daemonVersion: state.daemonVersion, appVersion: state.appVersion })),
  );
  const isDaemonOutdated = isDaemonVersionOutdated({ daemonVersion, appVersion });

  if (!isDaemonOutdated) {
    return null;
  }

  const tooltipTitle = t("daemon.version.outdatedMessage", {
    daemonVersion: daemonVersion ?? t("settings.daemon.values.unknown"),
    appVersion: appVersion ?? t("settings.daemon.values.unknown"),
  });

  return (
    <Tooltip placement="bottom" title={tooltipTitle}>
      <IconButton color="warning" aria-label={tooltipTitle} onClick={() => navigate("/settings?tab=daemon")}>
        <LuTriangleAlert size={14} />
      </IconButton>
    </Tooltip>
  );
}

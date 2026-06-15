import { Box, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArchive, LuClock, LuHistory } from "react-icons/lu";
import { overviewStore } from "../../store/overviewStore";

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder > 0 ? `${days}d ${remainder.toFixed(0)}h` : `${days}d`;
}

const thSx = {
  px: 1.5,
  py: 0.75,
  textAlign: "left" as const,
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "text.secondary",
  borderBottom: "1px solid",
  borderColor: "divider",
  whiteSpace: "nowrap" as const,
  bgcolor: "background.paper",
} as const;

const tdSx = {
  px: 1.5,
  py: 1,
  fontSize: 12,
  borderBottom: "1px solid",
  borderColor: "divider",
  whiteSpace: "nowrap" as const,
};

const tdNumericSx = { ...tdSx, textAlign: "right" as const, fontFamily: "monospace" };

const thNumericSx = { ...thSx, textAlign: "right" as const };

export function WorkspaceInsightsView() {
  const { t } = useTranslation();
  const insights = overviewStore((state) => state.workspaceInsights);
  const loadState = overviewStore((state) => state.workspaceInsightsLoadState);
  const [tab, setTab] = useState<"closed" | "primary">("closed");

  if (loadState === "loading" || loadState === "idle") {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          {t("overview.workspaceInsights.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("overview.workspaceInsights.loading")}
        </Typography>
      </Box>
    );
  }

  if (!insights) {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          {t("overview.workspaceInsights.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("overview.workspaceInsights.noData")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        {t("overview.workspaceInsights.title")}
      </Typography>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 1.5, minHeight: 36 }}>
        <Tab
          value="closed"
          label={t("overview.workspaceInsights.closedTab")}
          sx={{ minHeight: 36, py: 0.5, textTransform: "none", fontSize: 13 }}
        />
        <Tab
          value="primary"
          label={t("overview.workspaceInsights.primaryTab")}
          sx={{ minHeight: 36, py: 0.5, textTransform: "none", fontSize: 13 }}
        />
      </Tabs>

      {tab === "closed" ? (
        <ClosedTabContent insights={insights} t={t} />
      ) : (
        <PrimaryTabContent insights={insights} t={t} />
      )}
    </Box>
  );
}

function ClosedTabContent({
  insights,
  t,
}: {
  insights: NonNullable<ReturnType<typeof overviewStore.getState>["workspaceInsights"]>;
  t: (key: string) => string;
}) {
  return (
    <>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 120,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            p: 1.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <LuArchive size={18} style={{ opacity: 0.6 }} />
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("overview.workspaceInsights.closed")}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
              {insights.closedWorkspaceCount}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            flex: 1,
            minWidth: 120,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            p: 1.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <LuClock size={18} style={{ opacity: 0.6 }} />
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("overview.workspaceInsights.avgLifetime")}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
              {insights.averageLifetimeHours != null
                ? formatHours(insights.averageLifetimeHours)
                : t("overview.workspaceInsights.notAvailable")}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
        <LuHistory size={14} style={{ opacity: 0.6 }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {t("overview.workspaceInsights.lastClosed")}
        </Typography>
      </Box>

      {insights.lastClosedWorkspaces.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("overview.workspaceInsights.noClosed")}
        </Typography>
      ) : (
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "auto",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Box component="thead">
            <Box component="tr">
              <Box component="th" sx={thSx}>
                {t("overview.workspaceInsights.project")}
              </Box>
              <Box component="th" sx={thSx}>
                {t("overview.workspaceInsights.branch")}
              </Box>
              <Box component="th" sx={thNumericSx}>
                {t("overview.workspaceInsights.lifetime")}
              </Box>
              <Box component="th" sx={thNumericSx}>
                {t("overview.workspaceInsights.tokens")}
              </Box>
            </Box>
          </Box>
          <Box component="tbody">
            {insights.lastClosedWorkspaces.map((ws) => (
              <Box component="tr" key={ws.id}>
                <Box component="td" sx={tdSx}>
                  <Typography variant="body2" sx={{ fontSize: 12 }}>
                    {ws.projectName}
                  </Typography>
                </Box>
                <Box component="td" sx={{ ...tdSx, fontFamily: "monospace" }}>
                  {ws.branch ?? "-"}
                </Box>
                <Box component="td" sx={tdNumericSx}>
                  {formatHours(ws.lifetimeHours)}
                </Box>
                <Box component="td" sx={tdNumericSx}>
                  {formatTokens(ws.totalTokens)}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}

function PrimaryTabContent({
  insights,
  t,
}: {
  insights: NonNullable<ReturnType<typeof overviewStore.getState>["workspaceInsights"]>;
  t: (key: string) => string;
}) {
  return (
    <>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 120,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            p: 1.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <LuArchive size={18} style={{ opacity: 0.6 }} />
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("overview.workspaceInsights.primaryCount")}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
              {insights.primaryWorkspaceCount}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            flex: 1,
            minWidth: 120,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            p: 1.5,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <LuClock size={18} style={{ opacity: 0.6 }} />
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("overview.workspaceInsights.tokenUsage")}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
              {formatTokens(insights.primaryWorkspaceTokens)}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
        <LuHistory size={14} style={{ opacity: 0.6 }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {t("overview.workspaceInsights.topPrimary")}
        </Typography>
      </Box>

      {insights.topPrimaryWorkspaces.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("overview.workspaceInsights.noPrimary")}
        </Typography>
      ) : (
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "auto",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Box component="thead">
            <Box component="tr">
              <Box component="th" sx={thSx}>
                {t("overview.workspaceInsights.project")}
              </Box>
              <Box component="th" sx={thSx}>
                {t("overview.workspaceInsights.branch")}
              </Box>
              <Box component="th" sx={thNumericSx}>
                {t("overview.workspaceInsights.tokens")}
              </Box>
            </Box>
          </Box>
          <Box component="tbody">
            {insights.topPrimaryWorkspaces.map((ws) => (
              <Box component="tr" key={ws.id}>
                <Box component="td" sx={tdSx}>
                  <Typography variant="body2" sx={{ fontSize: 12 }}>
                    {ws.projectName}
                  </Typography>
                </Box>
                <Box component="td" sx={{ ...tdSx, fontFamily: "monospace" }}>
                  {ws.branch ?? "-"}
                </Box>
                <Box component="td" sx={tdNumericSx}>
                  {formatTokens(ws.totalTokens)}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}

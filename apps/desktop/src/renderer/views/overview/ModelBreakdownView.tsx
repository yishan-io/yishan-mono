import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { formatTokens } from "../../helpers/formatters";
import { overviewStore } from "../../store/overviewStore";

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

export function ModelBreakdownView() {
  const { t } = useTranslation();
  const models = overviewStore((state) => state.modelBreakdown);
  const loadState = overviewStore((state) => state.modelBreakdownLoadState);

  if (loadState === "loading" || loadState === "idle") {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          {t("overview.modelBreakdown.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("overview.modelBreakdown.loading")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        {t("overview.modelBreakdown.title")}
      </Typography>

      {models.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("overview.modelBreakdown.noData")}
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
                {t("overview.modelBreakdown.model")}
              </Box>
              <Box component="th" sx={thSx}>
                {t("overview.modelBreakdown.agent")}
              </Box>
              <Box component="th" sx={thNumericSx}>
                {t("overview.modelBreakdown.totalTokens")}
              </Box>
              <Box component="th" sx={thNumericSx}>
                {t("overview.modelBreakdown.input")}
              </Box>
              <Box component="th" sx={thNumericSx}>
                {t("overview.modelBreakdown.output")}
              </Box>
              <Box component="th" sx={thNumericSx}>
                {t("overview.modelBreakdown.percentage")}
              </Box>
            </Box>
          </Box>
          <Box component="tbody">
            {models.map((model) => (
              <Box component="tr" key={model.modelNormalized}>
                <Box component="td" sx={tdSx}>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {model.modelNormalized}
                  </Typography>
                </Box>
                <Box component="td" sx={tdSx}>
                  <Typography variant="body2" sx={{ fontSize: 12, textTransform: "capitalize" }}>
                    {model.agentKind}
                  </Typography>
                </Box>
                <Box component="td" sx={tdNumericSx}>
                  {formatTokens(model.totalTokens)}
                </Box>
                <Box component="td" sx={tdNumericSx}>
                  {formatTokens(model.inputTokens)}
                </Box>
                <Box component="td" sx={tdNumericSx}>
                  {formatTokens(model.outputTokens)}
                </Box>
                <Box component="td" sx={tdNumericSx}>
                  {model.percentage.toFixed(1)}%
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

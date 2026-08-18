import { Badge, Box } from "@mui/material";
import type { ReactNode } from "react";

export type StatusBadgeType = "success" | "error" | "warning" | "info" | "neutral";
export type StatusBadgeIndicator = "done" | "failed" | "waiting_input" | StatusBadgeType;

type StatusBadgeProps = {
  icon: ReactNode;
  indicator: StatusBadgeIndicator;
  testId?: string;
  ariaLabel?: string;
};

/** Maps workspace-specific and generic indicators to one badge type token. */
function resolveBadgeType(indicator: StatusBadgeIndicator): StatusBadgeType {
  if (indicator === "done") {
    return "success";
  }

  if (indicator === "failed") {
    return "error";
  }

  if (indicator === "waiting_input") {
    return "warning";
  }

  return indicator;
}

/** Resolves one badge-dot color token for a semantic badge type. */
function resolveBadgeDotColor(badgeType: StatusBadgeType): string {
  if (badgeType === "success") {
    return "success.main";
  }

  if (badgeType === "error") {
    return "error.main";
  }

  if (badgeType === "warning") {
    return "warning.main";
  }

  if (badgeType === "info") {
    return "info.main";
  }

  return "text.disabled";
}

/** Renders one icon wrapped with a top-left MUI dot badge from semantic or workspace indicators. */
export function StatusBadge({ icon, indicator, testId, ariaLabel }: StatusBadgeProps) {
  const badgeType = resolveBadgeType(indicator);

  return (
    <Box
      component="span"
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      data-testid={testId}
      data-indicator={indicator}
      data-badge-type={badgeType}
      sx={{ display: "inline-flex", lineHeight: 0 }}
    >
      <Badge
        variant="dot"
        overlap="circular"
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        sx={{
          "& .MuiBadge-badge": {
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: "1px solid",
            borderColor: "background.paper",
            backgroundColor: resolveBadgeDotColor(badgeType),
          },
        }}
      >
        {icon}
      </Badge>
    </Box>
  );
}

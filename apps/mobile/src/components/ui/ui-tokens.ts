/**
 * Owns mobile-local UI constants that are not shared through Tamagui theme slots yet.
 * Keep additions here explicit so raw colors and spacing remain traceable during cleanup.
 */
export const MOBILE_UI_TOKENS = {
  pane: {
    bodyBottom: 20,
    bodyTop: 12,
    headerX: 16,
    insetX: 16,
    noticeBottom: 8,
  },
  radius: {
    dialog: 20,
    input: 12,
    row: 14,
    surface: 16,
  },
  sheet: {
    actionMenuMinHeight: 164,
    backdrop: "rgba(15, 23, 42, 0.36)",
    cardWidth: "88%" as const,
    dialogPadding: 18,
    itemGap: 12,
    rowInsetX: 14,
    rowInsetY: 12,
    sideInset: 12,
  },
  status: {
    dotSize: 8,
    error: "#ef4444",
    running: "#2563eb",
    success: "#10b981",
    warning: "#f59e0b",
  },
} as const;

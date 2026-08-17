import { Box } from "@mui/material";
import type { ReactNode } from "react";

export type TabPanelProps = {
  /** Whether this panel is the currently visible tab. */
  active: boolean;
  children: ReactNode;
  /** Unique key used for the underlying element (useful for React reconciliation). */
  "data-testid"?: string;
};

/**
 * Renders one absolutely-positioned tab panel that toggles visibility based on
 * the `active` prop. When inactive, the panel is hidden via `display: none` but
 * remains mounted in the DOM so tab state is preserved.
 *
 * This replaces the repeated pattern across `MainPaneView` where each tab content
 * was wrapped in an identical `<Box sx={{ position: "absolute", inset: 0, display: isSelected ? "flex" : "none", flexDirection: "column" }}>`.
 *
 * @example
 * ```tsx
 * {tabs.map((tab) => (
 *   <TabPanel key={tab.id} active={tab.id === selectedTabId}>
 *     <FileEditor path={tab.data.path} ... />
 *   </TabPanel>
 * ))}
 * ```
 */
export function TabPanel({ active, children, "data-testid": dataTestId }: TabPanelProps) {
  return (
    <Box
      data-testid={dataTestId}
      sx={{
        position: "absolute",
        inset: 0,
        display: active ? "flex" : "none",
        flexDirection: "column",
      }}
    >
      {children}
    </Box>
  );
}

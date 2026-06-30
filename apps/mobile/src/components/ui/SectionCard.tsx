import type { PropsWithChildren } from "react";
import { Stack, useTheme } from "tamagui";

/** Owns the shared rounded surface shell for sectioned content cards. */
export function SectionCard({ children }: PropsWithChildren) {
  const theme = useTheme();

  return (
    <Stack
      style={{
        backgroundColor: theme.backgroundStrong?.val ?? theme.background.val,
        borderRadius: 22,
        overflow: "hidden",
      }}
    >
      {children}
    </Stack>
  );
}

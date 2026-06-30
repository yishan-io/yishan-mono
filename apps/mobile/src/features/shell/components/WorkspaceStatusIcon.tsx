import { View } from "react-native";
import { useTheme } from "tamagui";

import { CliSpinnerText } from "./CliSpinnerText";
import { DesktopWorkspaceKindIcon } from "./DesktopWorkspaceKindIcon";

import type { WorkspaceIndicator } from "@/features/notifications/notification-runtime-context";
import type { Workspace } from "@/features/workspaces/workspaces.types";

type WorkspaceStatusIconProps = {
  indicator: WorkspaceIndicator;
  kind: Workspace["kind"];
  runningMode?: "icon" | "spinner";
  size?: number;
  width?: number;
};

export function WorkspaceStatusIcon({
  indicator,
  kind,
  runningMode = "spinner",
  size = 16,
  width = 18,
}: WorkspaceStatusIconProps) {
  const theme = useTheme();
  const color =
    indicator === "waiting_input"
      ? theme.yellow10.val
      : indicator === "failed"
        ? theme.red10.val
        : indicator === "done"
          ? theme.green10.val
          : theme.gray10.val;
  const workspaceKind = kind === "primary" ? "primary" : "managed";

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        width,
      }}
    >
      {indicator === "running" ? (
        runningMode === "spinner" ? (
          <CliSpinnerText fontSize={Math.max(size + 4, 18)} />
        ) : (
          <DesktopWorkspaceKindIcon color={theme.gray10.val} kind={workspaceKind} size={size} />
        )
      ) : (
        <DesktopWorkspaceKindIcon color={color} kind={workspaceKind} size={size} />
      )}
    </View>
  );
}

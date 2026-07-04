import { Menu, PanelRightOpen, Plus, RefreshCw } from "@tamagui/lucide-icons";
import { Fragment } from "react";
import { ActivityIndicator, View } from "react-native";
import { XStack, useTheme } from "tamagui";

import { WorkbenchHeader } from "@/components/screens/WorkbenchFrame";
import { StatusDot } from "@/components/ui/StatusDot";
import { TransientNoticePill } from "@/components/ui/TransientNoticePill";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useActionCompletionNotice } from "@/components/ui/useActionCompletionNotice";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { ShellDrawerTopBarModel } from "../shell-screen.types";
import { ShellIconButton } from "./ShellPrimitives";
import { WorkspaceStatusIndicator } from "./WorkspaceStatusIndicator";

type ShellTopBarProps = ShellDrawerTopBarModel & {
  onOpenDrawer: () => void;
};

export function ShellTopBar({
  aggregateIndicator = "none",
  onOpenBrowser,
  onOpenQuickActions,
  onOpenDrawer,
  onRefreshSessions,
  refreshingSessions = false,
  sessionSyncError = false,
  subtitle,
  subtitleStatus,
  title,
}: ShellTopBarProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const { handleAction: handleRefreshSessions, showNotice: showSessionSyncNotice } = useActionCompletionNotice({
    hasError: sessionSyncError,
    isRefreshing: refreshingSessions,
    onAction: onRefreshSessions,
  });

  return (
    <Fragment>
      <WorkbenchHeader
        actions={
          <XStack style={{ alignItems: "center", gap: 4 }}>
            {onRefreshSessions ? (
              <ShellIconButton
                accessibilityLabel={t("shell.refreshSessions")}
                disabled={refreshingSessions}
                onPress={handleRefreshSessions}
              >
                {refreshingSessions ? (
                  <ActivityIndicator color={theme.color11.val} size="small" />
                ) : (
                  <RefreshCw color="$color11" size={18} />
                )}
              </ShellIconButton>
            ) : null}
            {onOpenQuickActions ? (
              <ShellIconButton accessibilityLabel={t("shell.whatsNext")} onPress={onOpenQuickActions}>
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: theme.color12.val,
                    borderRadius: 9,
                    height: 24,
                    justifyContent: "center",
                    width: 24,
                  }}
                >
                  <Plus color="$color1" size={16} strokeWidth={3} />
                </View>
              </ShellIconButton>
            ) : null}
            {onOpenBrowser ? (
              <ShellIconButton accessibilityLabel={t("shell.openWorkspaceBrowser")} onPress={onOpenBrowser}>
                <PanelRightOpen color="$color11" size={20} />
              </ShellIconButton>
            ) : null}
          </XStack>
        }
        leading={
          <View style={{ position: "relative" }}>
            <ShellIconButton accessibilityLabel={t("shell.openNavigation")} onPress={onOpenDrawer}>
              <Menu color="$color11" size={20} />
            </ShellIconButton>
            <ShellTopBarAggregateStatusDot indicator={aggregateIndicator} />
          </View>
        }
        subtitle={subtitle ?? undefined}
        subtitleLeading={
          subtitleStatus ? (
            <WorkspaceStatusIndicator
              runningMode="icon"
              size={14}
              width={14}
              workspaceId={subtitleStatus.workspaceId}
              workspaceKind={subtitleStatus.workspaceKind}
            />
          ) : undefined
        }
        title={title}
        titleNumberOfLines={1}
      />
      {showSessionSyncNotice ? (
        <View style={{ paddingTop: MOBILE_UI_TOKENS.shellChrome.dividerTopGap }}>
          <TransientNoticePill label={t("shell.sessionsSynced")} />
        </View>
      ) : null}
    </Fragment>
  );
}

function ShellTopBarAggregateStatusDot({
  indicator,
}: {
  indicator: NonNullable<ShellDrawerTopBarModel["aggregateIndicator"]>;
}) {
  const theme = useTheme();

  if (indicator === "none") {
    return null;
  }

  const color =
    indicator === "waiting_input"
      ? MOBILE_UI_TOKENS.status.warning
      : indicator === "failed"
        ? MOBILE_UI_TOKENS.status.error
        : MOBILE_UI_TOKENS.status.success;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 3,
        top: 3,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.background.val,
          borderRadius: 999,
          justifyContent: "center",
          padding: 1.5,
        }}
      >
        <StatusDot color={color} />
      </View>
    </View>
  );
}

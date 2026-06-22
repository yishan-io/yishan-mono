import { Building2, ChevronDown, ListFilter, Menu, PanelRightOpen, Plus, RefreshCw } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { Separator, Text, XStack, useTheme } from "tamagui";

import { ScreenHeader } from "@/components/screens/ScreenScaffold";
import { StatusDot } from "@/components/ui/StatusDot";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { WorkspaceAggregateIndicator } from "@/features/notifications/notification-runtime-context";
import { ShellIconButton } from "./ShellPrimitives";

type ShellTopBarProps = {
  aggregateIndicator?: WorkspaceAggregateIndicator;
  onOpenBrowser?: (() => void) | null;
  onOpenQuickActions?: (() => void) | null;
  onOpenDrawer: () => void;
  onRefreshSessions?: (() => void) | null;
  refreshingSessions?: boolean;
  subtitle?: string | null;
  subtitleLeading?: ReactNode;
  title: string;
};

type ShellDrawerPanelHeaderProps = {
  currentOrganizationName: string;
  organizationCount: number;
  onOpenProfileControls: () => void;
  onOpenOrganizationSelector: () => void;
  onOpenWorkspaceTreeFilter?: (() => void) | null;
  userAvatarUrl?: string | null;
  userName: string;
};

export function ShellTopBar({
  aggregateIndicator = "none",
  onOpenBrowser,
  onOpenQuickActions,
  onOpenDrawer,
  onRefreshSessions,
  refreshingSessions = false,
  subtitle,
  subtitleLeading,
  title,
}: ShellTopBarProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
      <ScreenHeader
        actions={
          <XStack style={{ alignItems: "center", gap: 4 }}>
            {onRefreshSessions ? (
              <ShellIconButton
                accessibilityLabel={t("shell.refreshSessions")}
                disabled={refreshingSessions}
                onPress={onRefreshSessions}
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
        subtitleLeading={subtitleLeading}
        title={title}
        titleNumberOfLines={1}
        titleVariant="prominent"
      />
      <View style={{ backgroundColor: theme.borderColor.val, height: 1, marginTop: 12 }} />
    </View>
  );
}

function ShellTopBarAggregateStatusDot({
  indicator,
}: {
  indicator: WorkspaceAggregateIndicator;
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

export function ShellDrawerPanelHeader({
  currentOrganizationName,
  organizationCount,
  onOpenProfileControls,
  onOpenOrganizationSelector,
  onOpenWorkspaceTreeFilter,
  userAvatarUrl,
  userName,
}: ShellDrawerPanelHeaderProps) {
  const { t } = useAppLanguage();

  return (
    <>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <XStack style={{ alignItems: "center", flex: 1, gap: 4, minWidth: 0 }}>
          <OrganizationSelectorButton
            disabled={organizationCount === 0}
            label={currentOrganizationName}
            onPress={onOpenOrganizationSelector}
          />
        </XStack>
        <XStack style={{ alignItems: "center", gap: 4 }}>
          {onOpenWorkspaceTreeFilter ? (
            <ShellIconButton accessibilityLabel={t("shell.filterWorkspaceTree")} onPress={onOpenWorkspaceTreeFilter}>
              <ListFilter color="$gray11" size={15} />
            </ShellIconButton>
          ) : null}
        </XStack>
        <AvatarButton avatarUrl={userAvatarUrl} name={userName} onPress={onOpenProfileControls} />
      </View>

      <Separator />
    </>
  );
}

function AvatarButton({
  avatarUrl,
  name,
  onPress,
}: {
  avatarUrl?: string | null;
  name: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const initials = getInitials(name);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ backgroundColor: theme.blue9.val, borderRadius: 999, height: 36, overflow: "hidden", width: 36 }}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={{ height: "100%", width: "100%" }} />
      ) : (
        <XStack style={{ alignItems: "center", height: "100%", justifyContent: "center", width: "100%" }}>
          <Text color="$color1" fontSize="$4" fontWeight="700">
            {initials}
          </Text>
        </XStack>
      )}
    </Pressable>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "Y";
  }

  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function OrganizationSelectorButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ borderRadius: 12, opacity: disabled ? 0.5 : 1, paddingVertical: 8 }}
    >
      <XStack style={{ alignItems: "center", gap: 8 }}>
        <Building2 size={16} color="$color11" />
        <Text color="$color11" fontSize="$5" fontWeight="500">
          {label}
        </Text>
        <ChevronDown size={14} color="$color11" />
      </XStack>
    </Pressable>
  );
}

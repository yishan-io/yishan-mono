import { Building2, ChevronDown, ListFilter } from "@tamagui/lucide-icons";
import { Image, Pressable, View } from "react-native";
import { Text, XStack, useTheme } from "tamagui";

import { WorkbenchPaneHeaderFrame } from "@/components/screens/WorkbenchPaneHeaderFrame";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { ShellIconButton } from "./ShellPrimitives";

type ShellDrawerPanelHeaderProps = {
  currentOrganizationName: string;
  organizationCount: number;
  onOpenProfileControls: () => void;
  onOpenOrganizationSelector: () => void;
  onOpenWorkspaceTreeFilter?: (() => void) | null;
  userAvatarUrl?: string | null;
  userName: string;
};

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
    <WorkbenchPaneHeaderFrame>
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
    </WorkbenchPaneHeaderFrame>
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

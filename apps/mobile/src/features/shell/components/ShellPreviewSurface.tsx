import { FileText, GitCompare } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { View } from "react-native";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { PaneHeader } from "./PaneHeader";

type ShellPreviewSurfaceProps = {
  children: ReactNode;
  onOpenPaneTabs?: (() => void) | null;
  path: string;
  tabKind: "diff" | "file";
};

export function ShellPreviewSurface({ children, onOpenPaneTabs, path, tabKind }: ShellPreviewSurfaceProps) {
  const { t } = useAppLanguage();
  const TabIcon = tabKind === "diff" ? GitCompare : FileText;
  const tabLabel = tabKind === "diff" ? t("shell.changes") : t("shell.file");

  return (
    <View style={{ flex: 1 }}>
      <PaneHeader
        leadingIcon={<TabIcon color="$color11" size={15} />}
        onPress={onOpenPaneTabs}
        title={path}
        typeLabel={tabLabel}
      />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

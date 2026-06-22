import { ScreenHeader, ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppTheme } from "@/features/theme/AppThemeProvider";
import { WorkspaceBrowserContent } from "@/features/workspaces/browser/components/WorkspaceBrowserContent";
import { useWorkspaceBrowserModel } from "@/features/workspaces/browser/view-model/useWorkspaceBrowserModel";
import { getThemeBackgroundAppColor } from "@/lib/theme/tamaguiThemes";
import { GitBranch } from "@tamagui/lucide-icons";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function WorkspaceBrowserScreen() {
  const model = useWorkspaceBrowserModel();
  const { resolvedTheme } = useAppTheme();

  if (!model.hasContext) {
    return (
      <ScreenScaffold title={model.t("shell.files")} onBack={model.onMissingContextBack}>
        <EmptyState title={model.t("shell.files")} message={model.t("shell.fileBrowserMissingContext")} />
      </ScreenScaffold>
    );
  }

  return (
    <SafeAreaView style={{ backgroundColor: getThemeBackgroundAppColor(resolvedTheme), flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingBottom: 12, paddingHorizontal: 16, paddingTop: 8 }}>
          <ScreenHeader
            {...model.browserHeader}
            subtitleLeading={
              model.browserHeaderSubtitleKind === "branch" ? <GitBranch color="$gray11" size={13} /> : null
            }
          />
        </View>
        <WorkspaceBrowserContent model={model} />
      </View>
    </SafeAreaView>
  );
}

import { WorkbenchFrame, WorkbenchHeader } from "@/components/screens/WorkbenchFrame";
import { EmptyState } from "@/components/ui/EmptyState";
import { WorkspaceBrowserContent } from "@/features/workspaces/browser/components/WorkspaceBrowserContent";
import { useWorkspaceBrowserModel } from "@/features/workspaces/browser/view-model/useWorkspaceBrowserModel";
import { GitBranch } from "@tamagui/lucide-icons";
import { View } from "react-native";

export function WorkspaceBrowserScreen() {
  const model = useWorkspaceBrowserModel();

  const header = (
    <WorkbenchHeader
      {...model.browserHeader}
      subtitleLeading={model.browserHeaderSubtitleKind === "branch" ? <GitBranch color="$gray11" size={13} /> : null}
    />
  );

  if (!model.hasContext) {
    return (
      <WorkbenchFrame
        bodyDensity="padded"
        header={<WorkbenchHeader onBack={model.onMissingContextBack} title={model.t("shell.files")} />}
      >
        <EmptyState title={model.t("shell.files")} message={model.t("shell.fileBrowserMissingContext")} />
      </WorkbenchFrame>
    );
  }

  return (
    <WorkbenchFrame bodyDensity="flush" header={header}>
      {/* Mobile presents the desktop right pane as its own route-hosted workbench surface. */}
      <View style={{ flex: 1, minHeight: 0 }}>
        <WorkspaceBrowserContent model={model} />
      </View>
    </WorkbenchFrame>
  );
}

import { useEffect, useState } from "react";
import { View, YStack } from "tamagui";

import { WorkbenchPanelSurface } from "@/components/screens/WorkbenchPanelSurface";
import { resolveWorkbenchChromeLayout } from "@/components/screens/workbenchFrameDomain";
import type { useWorkspaceBrowserModel } from "@/features/workspaces/browser/view-model/useWorkspaceBrowserModel";
import { WorkspaceBrowserTabs } from "./WorkspaceBrowserTabs";
import { WorkspaceChangesTabPane } from "./WorkspaceChangesTab";
import { WorkspaceFileTreePane } from "./WorkspaceFileTree";
import { WorkspacePullRequestsTabPane } from "./WorkspacePullRequestsTabPane";

const BROWSER_TABS = ["files", "changes", "prs"] as const;
type BrowserTab = (typeof BROWSER_TABS)[number];

type WorkspaceBrowserContentProps = {
  model: ReturnType<typeof useWorkspaceBrowserModel>;
};

export function WorkspaceBrowserContent({ model }: WorkspaceBrowserContentProps) {
  const chromeLayout = resolveWorkbenchChromeLayout();
  const [loadedTabs, setLoadedTabs] = useState<Set<BrowserTab>>(() => new Set([model.activeTab]));

  useEffect(() => {
    setLoadedTabs((current) => {
      if (current.has(model.activeTab)) {
        return current;
      }

      return new Set(current).add(model.activeTab);
    });
  }, [model.activeTab]);

  return (
    <WorkbenchPanelSurface
      gap={chromeLayout.dividerTopGap}
      header={
        <WorkspaceBrowserTabs activeTab={model.browserTabs.activeTab} onSelectTab={model.browserTabs.onSelectTab} />
      }
      topInset={0}
    >
      <View style={{ flex: 1, minHeight: 0 }}>
        {loadedTabs.has("files") ? (
          <YStack display={model.activeTab === "files" ? "flex" : "none"} flex={1}>
            <WorkspaceFileTreePane {...model.filesPane} />
          </YStack>
        ) : null}
        {loadedTabs.has("changes") ? (
          <YStack display={model.activeTab === "changes" ? "flex" : "none"} flex={1}>
            <WorkspaceChangesTabPane {...model.changesPane} />
          </YStack>
        ) : null}
        {loadedTabs.has("prs") ? (
          <YStack display={model.activeTab === "prs" ? "flex" : "none"} flex={1}>
            <WorkspacePullRequestsTabPane {...model.prsPane} />
          </YStack>
        ) : null}
      </View>
    </WorkbenchPanelSurface>
  );
}

import { useEffect, useState } from "react";
import { YStack } from "tamagui";

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
    <YStack style={{ flex: 1, gap: 12 }}>
      <YStack style={{ paddingHorizontal: 16 }}>
        <WorkspaceBrowserTabs activeTab={model.browserTabs.activeTab} onSelectTab={model.browserTabs.onSelectTab} />
      </YStack>
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
    </YStack>
  );
}

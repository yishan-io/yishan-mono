import { View } from "react-native";

import { WorkspaceDiffPreviewPane } from "@/features/workspaces/preview/components/WorkspaceDiffPreview";
import { WorkspaceFilePreviewPane } from "@/features/workspaces/preview/components/WorkspaceFilePreview";
import type { ShellPaneTab } from "../state/shell.types";
import { type ShellChatModel, ShellChatSurface } from "./ShellChatSurface";
import { ShellPreviewSurface } from "./ShellPreviewSurface";

export type ShellFocusPanePreviewContext = {
  organizationId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
};

type ShellFocusPaneProps = {
  activeTab: ShellPaneTab | null;
  chat: ShellChatModel;
  onOpenPaneTabs?: (() => void) | null;
  previewContext: ShellFocusPanePreviewContext;
};

export function ShellFocusPane({ activeTab, chat, onOpenPaneTabs, previewContext }: ShellFocusPaneProps) {
  if (!activeTab || activeTab.kind === "terminal") {
    return (
      <View style={{ flex: 1, minHeight: 0 }}>
        <ShellChatSurface chat={chat} />
      </View>
    );
  }

  if (!previewContext.organizationId || !previewContext.projectId || !previewContext.workspaceId) {
    return null;
  }

  if (activeTab.kind === "file") {
    return (
      <ShellPreviewSurface onOpenPaneTabs={onOpenPaneTabs} path={activeTab.path} tabKind={activeTab.kind}>
        <WorkspaceFilePreviewPane
          organizationId={previewContext.organizationId}
          path={activeTab.path}
          projectId={previewContext.projectId}
          workspaceId={previewContext.workspaceId}
        />
      </ShellPreviewSurface>
    );
  }

  return (
    <ShellPreviewSurface onOpenPaneTabs={onOpenPaneTabs} path={activeTab.path} tabKind={activeTab.kind}>
      <WorkspaceDiffPreviewPane
        changeKind={activeTab.changeKind}
        organizationId={previewContext.organizationId}
        path={activeTab.path}
        projectId={previewContext.projectId}
        workspaceId={previewContext.workspaceId}
      />
    </ShellPreviewSurface>
  );
}

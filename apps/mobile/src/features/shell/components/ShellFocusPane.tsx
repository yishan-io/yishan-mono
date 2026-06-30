import { View } from "react-native";

import { WorkspaceDiffPreviewPane } from "@/features/workspaces/preview/components/WorkspaceDiffPreview";
import { WorkspaceFilePreviewPane } from "@/features/workspaces/preview/components/WorkspaceFilePreview";
import type { ShellPaneTab } from "../state/shell.types";
import { type ShellChatModel, ShellChatSurface } from "./ShellChatSurface";
import { ShellPreviewSurface } from "./ShellPreviewSurface";

export type ShellFocusPanePreviewContext = {
  nodeId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
};

type ShellFocusPaneProps = {
  activeTab: ShellPaneTab | null;
  chat: ShellChatModel;
  onRegisterKeyboardDismissHandler?: ((handler: (() => void) | null) => void) | null;
  onOpenPaneTabs?: (() => void) | null;
  previewContext: ShellFocusPanePreviewContext;
};

export function ShellFocusPane({
  activeTab,
  chat,
  onOpenPaneTabs,
  onRegisterKeyboardDismissHandler,
  previewContext,
}: ShellFocusPaneProps) {
  if (!activeTab || activeTab.kind === "terminal") {
    return (
      <View style={{ flex: 1, minHeight: 0 }}>
        <ShellChatSurface chat={chat} onRegisterKeyboardDismissHandler={onRegisterKeyboardDismissHandler} />
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
          nodeId={previewContext.nodeId ?? null}
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
        nodeId={previewContext.nodeId ?? null}
        organizationId={previewContext.organizationId}
        path={activeTab.path}
        projectId={previewContext.projectId}
        workspaceId={previewContext.workspaceId}
      />
    </ShellPreviewSurface>
  );
}

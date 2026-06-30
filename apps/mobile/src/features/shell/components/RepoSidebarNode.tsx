import { ChevronDown, ChevronRight, MoreVertical } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Button, Text, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { NodeGlyph } from "@/features/nodes/components/NodeGlyph";
import type { NodeKind, NodeScope } from "@/features/nodes/nodes.types";
import { renderMobileProjectIcon } from "@/features/projects/project-icons";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import { SIDEBAR_TREE_GAP, SIDEBAR_TREE_INDENT } from "@/features/shell/state/shell.constants";
import type { ShellSelection } from "@/features/shell/state/shell.types";
import { workspaceSidebarLabel } from "@/features/shell/view-model/shell-labels";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { ShellTreeIconBadge, ShellTreeRow } from "./ShellPrimitives";
import { WorkspaceStatusIndicator } from "./WorkspaceStatusIndicator";

type ProjectSidebarNodeProps = {
  children?: ReactNode;
  folded: boolean;
  indent?: number;
  onOpenMenu: () => void;
  onToggleFold: () => void;
  project: ProjectWithWorkspaces;
  selectedSelection: Extract<ShellSelection, { kind: "workspace" }> | null;
  showMenuActions?: boolean;
};

type NodeSidebarNodeProps = {
  children?: ReactNode;
  folded: boolean;
  indent?: number;
  nodeKind?: NodeKind;
  nodeName: string;
  nodeScope?: NodeScope;
  onToggleFold: () => void;
};

function ExpandChevron({ folded }: { folded: boolean }) {
  const Icon = folded ? ChevronRight : ChevronDown;

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 16 }}>
      <Icon color="$gray11" size={16} />
    </View>
  );
}

export function NodeSidebarNode({
  children,
  folded,
  indent = 0,
  nodeKind,
  nodeName,
  nodeScope,
  onToggleFold,
}: NodeSidebarNodeProps) {
  return (
    <View style={{ gap: SIDEBAR_TREE_GAP }}>
      <Pressable onPress={onToggleFold}>
        <ShellTreeRow indent={indent}>
          <ExpandChevron folded={folded} />
          <NodeGlyph color="$gray11" kind={nodeKind} scope={nodeScope} size={16} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text fontSize="$5" fontWeight="500" numberOfLines={1}>
              {nodeName}
            </Text>
          </View>
        </ShellTreeRow>
      </Pressable>
      {!folded && children ? <View style={{ gap: SIDEBAR_TREE_GAP }}>{children}</View> : null}
    </View>
  );
}

export function ProjectSidebarNode({
  children,
  folded,
  indent = 0,
  onOpenMenu,
  onToggleFold,
  project,
  selectedSelection,
  showMenuActions = true,
}: ProjectSidebarNodeProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();

  return (
    <View style={{ gap: SIDEBAR_TREE_GAP }}>
      <Pressable onPress={onToggleFold}>
        <ShellTreeRow indent={indent}>
          <ExpandChevron folded={folded} />
          <ShellTreeIconBadge backgroundColor={project.color || theme.blue9.val}>
            {renderMobileProjectIcon(project.icon, 12)}
          </ShellTreeIconBadge>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text fontSize="$5" fontWeight="500" numberOfLines={1}>
              {project.name}
            </Text>
          </View>
          {showMenuActions ? (
            <Button
              chromeless
              size="$3"
              icon={MoreVertical}
              onPress={onOpenMenu}
              aria-label={t("common.moreActions")}
            />
          ) : null}
        </ShellTreeRow>
      </Pressable>
      {!folded && children ? <View style={{ gap: SIDEBAR_TREE_GAP }}>{children}</View> : null}
    </View>
  );
}

export function WorkspaceSidebarNode({
  onOpenMenu,
  onSelectWorkspace,
  selected,
  showMenuActions,
  workspace,
}: {
  onOpenMenu: () => void;
  onSelectWorkspace: () => void;
  selected: boolean;
  showMenuActions: boolean;
  workspace: Workspace;
}) {
  const { t } = useAppLanguage();
  return (
    <Pressable onPress={onSelectWorkspace}>
      <ShellTreeRow indent={SIDEBAR_TREE_INDENT * 2} minHeight={44} paddingVertical={0} selected={selected}>
        <View style={{ width: 16 }} />
        <WorkspaceStatusIndicator workspaceId={workspace.id} workspaceKind={workspace.kind} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text fontSize="$5" fontWeight="500" numberOfLines={1}>
            {workspaceSidebarLabel(workspace, t)}
          </Text>
        </View>
        {showMenuActions ? (
          <Button chromeless size="$3" icon={MoreVertical} onPress={onOpenMenu} aria-label={t("common.moreActions")} />
        ) : null}
      </ShellTreeRow>
    </Pressable>
  );
}

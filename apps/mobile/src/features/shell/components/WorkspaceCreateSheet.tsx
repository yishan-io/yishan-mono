import { X } from "@tamagui/lucide-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { YStack, useTheme } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { useWorkspaceCreateSheetModel } from "../view-model/useWorkspaceCreateSheetModel";
import { WorkspaceCreateFormFields } from "./WorkspaceCreateFormFields";
import { WorkspaceCreateNodeSelectorSheet } from "./WorkspaceCreateNodeSelectorSheet";

type WorkspaceCreateSheetProps = {
  currentNodeId: string | null;
  currentNodes: Node[];
  onClose: () => void;
  onCreatedWorkspace?: (workspace: Workspace) => void;
  open: boolean;
  project: ProjectWithWorkspaces | null;
};

export function WorkspaceCreateSheet({
  currentNodeId,
  currentNodes,
  onClose,
  onCreatedWorkspace,
  open,
  project,
}: WorkspaceCreateSheetProps) {
  const theme = useTheme();
  const [nodeSelectorOpen, setNodeSelectorOpen] = useState(false);
  const model = useWorkspaceCreateSheetModel({
    currentNodeId,
    currentNodes,
    onClose,
    onCreatedWorkspace,
    open,
    project,
  });

  useEffect(() => {
    if (!open || model.isCreatingWorkspace) {
      setNodeSelectorOpen(false);
    }
  }, [model.isCreatingWorkspace, open]);

  return (
    <>
      <AppModalSheet
        contentStyle={{
          borderColor: theme.borderColor.val,
          borderRadius: MOBILE_UI_TOKENS.radius.dialog,
          borderWidth: 1,
          gap: 14,
          maxHeight: "82%",
          padding: 18,
        }}
        headerRight={
          <Pressable
            accessibilityRole="button"
            disabled={model.isCreatingWorkspace}
            hitSlop={8}
            onPress={model.handleClose}
            style={{ opacity: model.isCreatingWorkspace ? 0.45 : 1, padding: 4 }}
          >
            <X color="$color11" size={20} />
          </Pressable>
        }
        keyboardAvoiding
        onClose={model.handleClose}
        open={open}
        position="center"
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <YStack style={{ gap: 14 }}>
            <WorkspaceCreateFormFields
              model={model}
              onOpenNodeSelector={() => setNodeSelectorOpen(true)}
              project={project}
            />
          </YStack>
        </ScrollView>
      </AppModalSheet>

      <WorkspaceCreateNodeSelectorSheet
        model={model}
        onClose={() => setNodeSelectorOpen(false)}
        onSelectNode={(nodeId) => {
          const selectedOption = model.nodeOptions.find((option) => option.nodeId === nodeId);
          if (!selectedOption) {
            return;
          }

          model.handleSelectNode(selectedOption);
          setNodeSelectorOpen(false);
        }}
        open={nodeSelectorOpen}
      />
    </>
  );
}

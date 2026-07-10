import { Check, GitBranch } from "@tamagui/lucide-icons";
import { Pressable } from "react-native";
import { Text, XStack, YStack, useTheme } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { NodeGlyph } from "@/features/nodes/components/NodeGlyph";
import type { WorkspaceCreateSheetModel } from "../view-model/useWorkspaceCreateSheetModel";

type WorkspaceCreateNodeSelectorSheetProps = {
  model: WorkspaceCreateSheetModel;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  open: boolean;
};

export function WorkspaceCreateNodeSelectorSheet({
  model,
  onClose,
  onSelectNode,
  open,
}: WorkspaceCreateNodeSelectorSheetProps) {
  const theme = useTheme();

  return (
    <AppModalSheet onClose={onClose} open={open} position="bottom">
      <Text fontSize="$7" fontWeight="700">
        {model.t("shell.workspaceCreateNodeLabel")}
      </Text>
      <YStack style={{ gap: 8 }}>
        {model.nodeOptions.map((option) => {
          const selected = model.selectedNode?.nodeId === option.nodeId;

          return (
            <Pressable key={option.nodeId} accessibilityRole="button" onPress={() => onSelectNode(option.nodeId)}>
              <XStack
                style={{
                  alignItems: "center",
                  backgroundColor: selected ? theme.gray3.val : "transparent",
                  borderRadius: MOBILE_UI_TOKENS.radius.row,
                  gap: 12,
                  minHeight: 56,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              >
                <NodeGlyph color="$color" kind={option.nodeKind} scope={option.nodeScope} size={16} />
                <YStack style={{ flex: 1, gap: 4, minWidth: 0 }}>
                  <Text fontSize="$5" fontWeight="600" numberOfLines={1}>
                    {option.nodeName}
                  </Text>
                  <XStack style={{ alignItems: "center", gap: 6 }}>
                    <GitBranch color="$gray11" size={14} />
                    <Text color="$gray11" fontSize="$3" numberOfLines={1}>
                      {option.sourceBranch}
                    </Text>
                  </XStack>
                </YStack>
                {selected ? <Check color="$green10" size={18} /> : null}
              </XStack>
            </Pressable>
          );
        })}
      </YStack>
    </AppModalSheet>
  );
}

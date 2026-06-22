import { Check, ChevronDown, GitBranch, X } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Input, Paragraph, Text, XStack, YStack, useTheme } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { NodeGlyph } from "@/features/nodes/components/NodeGlyph";
import type { Node } from "@/features/nodes/nodes.types";
import { renderMobileProjectIcon } from "@/features/projects/project-icons";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { useWorkspaceCreateSheetModel } from "../view-model/useWorkspaceCreateSheetModel";
import { ShellTreeIconBadge } from "./ShellPrimitives";
import { WorkspaceCreateSourceBranchSelector } from "./WorkspaceCreateSourceBranchSelector";

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
  const inputStyle = {
    backgroundColor: theme.gray3.val,
    borderColor: theme.gray7.val,
    borderRadius: MOBILE_UI_TOKENS.radius.input,
    color: theme.color.val,
    minHeight: 48,
    paddingHorizontal: 14,
  } as const;
  const model = useWorkspaceCreateSheetModel({
    currentNodeId,
    currentNodes,
    onClose,
    onCreatedWorkspace,
    open,
    project,
  });

  useEffect(() => {
    if (!open) {
      setNodeSelectorOpen(false);
    }
  }, [open]);

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
        keyboardAvoiding
        onClose={model.handleClose}
        open={open}
        position="center"
        headerRight={
          <Pressable accessibilityRole="button" hitSlop={8} onPress={model.handleClose} style={{ padding: 4 }}>
            <X color="$color11" size={20} />
          </Pressable>
        }
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <YStack style={{ gap: 14 }}>
            <Text fontSize="$9" fontWeight="800">
              {model.t("shell.workspaceCreateTitle")}
            </Text>

            <FieldLabel label={model.t("shell.workspaceCreateProjectLabel")} />
            <StaticFieldCard>
              <ShellTreeIconBadge backgroundColor={project?.color || theme.blue9.val}>
                {renderMobileProjectIcon(project?.icon, 14)}
              </ShellTreeIconBadge>
              <Text fontSize="$7" fontWeight="500" numberOfLines={1}>
                {project?.name ?? ""}
              </Text>
            </StaticFieldCard>

            <FieldLabel label={model.t("shell.workspaceCreateSourceBranchLabel")} />
            <WorkspaceCreateSourceBranchSelector
              emptyLabel={model.t("shell.workspaceCreateSourceBranchEmpty")}
              errorMessage={model.sourceBranchError}
              groups={model.sourceBranchGroups}
              isDisabled={model.isSourceBranchSelectorDisabled}
              isLoading={model.isLoadingSourceBranches}
              loadingLabel={model.t("shell.workspaceCreateSourceBranchLoading")}
              localGroupLabel={model.t("shell.workspaceCreateSourceBranchLocalGroup")}
              manualEntryPlaceholder={model.t("shell.workspaceCreateSourceBranchPlaceholder")}
              onChangeBranchText={model.onChangeSourceBranch}
              onClose={model.handleCloseSourceBranchSelector}
              onOpen={model.handleOpenSourceBranchSelector}
              onRetry={model.handleRetrySourceBranches}
              onSelectBranch={model.handleSelectSourceBranch}
              open={model.isSourceBranchSelectorOpen}
              placeholder={model.t("shell.workspaceCreateSourceBranchPlaceholder")}
              remoteGroupLabel={model.t("shell.workspaceCreateSourceBranchRemoteGroup")}
              retryLabel={model.t("common.retry")}
              selectedBranch={model.sourceBranch}
              worktreeGroupLabel={model.t("shell.workspaceCreateSourceBranchWorktreeGroup")}
            />

            <TwoColumnFieldRow>
              <FieldColumn>
                <FieldLabel label={model.t("shell.workspaceCreateNameLabel")} />
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={model.onChangeName}
                  placeholder={model.t("shell.workspaceCreateNamePlaceholder")}
                  style={inputStyle}
                  value={model.name}
                />
              </FieldColumn>
              <FieldColumn>
                <FieldLabel label={model.t("shell.workspaceCreateBranchLabel")} />
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={model.handleChangeTargetBranch}
                  placeholder={model.t("shell.workspaceCreateBranchPlaceholder")}
                  style={inputStyle}
                  value={model.targetBranch}
                />
              </FieldColumn>
            </TwoColumnFieldRow>

            <FieldLabel label={model.t("shell.workspaceCreateNodeLabel")} />
            <Pressable
              accessibilityRole="button"
              disabled={model.nodeOptions.length <= 1}
              onPress={() => setNodeSelectorOpen(true)}
              style={({ pressed }) => ({
                opacity: model.nodeOptions.length <= 1 ? 1 : pressed ? 0.72 : 1,
              })}
            >
              <StaticFieldCard>
                {model.selectedNode ? (
                  <>
                    <NodeGlyph
                      color="$color"
                      kind={model.selectedNode.nodeKind}
                      scope={model.selectedNode.nodeScope}
                      size={16}
                    />
                    <Text fontSize="$6" fontWeight="500" numberOfLines={1} style={{ flex: 1 }}>
                      {model.selectedNode.nodeName}
                    </Text>
                    {model.nodeOptions.length > 1 ? <ChevronDown color="$color11" size={18} /> : null}
                  </>
                ) : (
                  <Text color="$gray11" fontSize="$6">
                    {model.t("shell.workspaceCreateNoEligiblePrimary")}
                  </Text>
                )}
              </StaticFieldCard>
            </Pressable>

            {model.submitError ? <Paragraph color="$red10">{model.submitError}</Paragraph> : null}
            {!model.selectedNode ? (
              <Paragraph color="$gray11">{model.t("shell.workspaceCreateNoEligiblePrimary")}</Paragraph>
            ) : null}

            <Button disabled={model.isSubmitDisabled} height={48} onPress={model.onSubmit} themeInverse>
              {model.t("shell.workspaceCreateSubmit")}
            </Button>
          </YStack>
        </ScrollView>
      </AppModalSheet>

      <AppModalSheet onClose={() => setNodeSelectorOpen(false)} open={nodeSelectorOpen} position="bottom">
        <Text fontSize="$7" fontWeight="700">
          {model.t("shell.workspaceCreateNodeLabel")}
        </Text>
        <YStack style={{ gap: 8 }}>
          {model.nodeOptions.map((option) => {
            const selected = model.selectedNode?.nodeId === option.nodeId;

            return (
              <Pressable
                key={option.nodeId}
                accessibilityRole="button"
                onPress={() => {
                  model.handleSelectNode(option);
                  setNodeSelectorOpen(false);
                }}
              >
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
    </>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <Text color="$gray11" fontSize="$4" fontWeight="500">
      {label}
    </Text>
  );
}

function StaticFieldCard({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <XStack
      style={{
        alignItems: "center",
        backgroundColor: theme.gray3.val,
        borderRadius: 999,
        gap: 12,
        minHeight: 48,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      {children}
    </XStack>
  );
}

function TwoColumnFieldRow({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}

function FieldColumn({ children }: { children: ReactNode }) {
  return <YStack style={{ flex: 1, gap: 8 }}>{children}</YStack>;
}

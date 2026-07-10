import { ChevronDown } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Button, Input, Paragraph, Text, XStack, YStack, useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { NodeGlyph } from "@/features/nodes/components/NodeGlyph";
import { renderMobileProjectIcon } from "@/features/projects/project-icons";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { WorkspaceCreateSheetModel } from "../view-model/useWorkspaceCreateSheetModel";
import { ShellTreeIconBadge } from "./ShellPrimitives";
import { WorkspaceCreateSourceBranchSelector } from "./WorkspaceCreateSourceBranchSelector";

type WorkspaceCreateFormFieldsProps = {
  model: WorkspaceCreateSheetModel;
  onOpenNodeSelector: () => void;
  project: ProjectWithWorkspaces | null;
};

export function WorkspaceCreateFormFields({ model, onOpenNodeSelector, project }: WorkspaceCreateFormFieldsProps) {
  const theme = useTheme();
  const inputStyle = {
    backgroundColor: theme.gray3.val,
    borderColor: theme.gray7.val,
    borderRadius: MOBILE_UI_TOKENS.radius.input,
    color: theme.color.val,
    minHeight: 48,
    paddingHorizontal: 14,
  } as const;

  return (
    <>
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
        isDisabled={model.isSourceBranchSelectorDisabled || model.isCreatingWorkspace}
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
            editable={!model.isCreatingWorkspace}
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
            editable={!model.isCreatingWorkspace}
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
        disabled={model.isCreatingWorkspace || model.nodeOptions.length <= 1}
        onPress={onOpenNodeSelector}
        style={({ pressed }) => ({
          opacity: model.isCreatingWorkspace || model.nodeOptions.length <= 1 ? 1 : pressed ? 0.72 : 1,
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
      {model.progressMessage ? <Paragraph color="$gray11">{model.progressMessage}</Paragraph> : null}
      {!model.selectedNode ? (
        <Paragraph color="$gray11">{model.t("shell.workspaceCreateNoEligiblePrimary")}</Paragraph>
      ) : null}

      <Button disabled={model.isSubmitDisabled} height={48} onPress={model.onSubmit} themeInverse>
        {model.t("shell.workspaceCreateSubmit")}
      </Button>
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

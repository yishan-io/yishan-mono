import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { WorkspaceCreateSourceBranchGroups } from "@/features/shell/commands/workspace-create-sheet-domain";
import { Check, ChevronDown, GitBranch } from "@tamagui/lucide-icons";
import { Pressable, ScrollView } from "react-native";
import { Button, Input, Paragraph, Spinner, Text, XStack, YStack, useTheme } from "tamagui";

import { resolveWorkspaceCreateSourceBranchSections } from "../domain/workspace-create-source-branch-selector-domain";

type WorkspaceCreateSourceBranchSelectorProps = {
  emptyLabel: string;
  groups: WorkspaceCreateSourceBranchGroups;
  isDisabled: boolean;
  isLoading: boolean;
  loadingLabel: string;
  localGroupLabel: string;
  manualEntryPlaceholder: string;
  onChangeBranchText: (sourceBranch: string) => void;
  onClose: () => void;
  onOpen: () => void;
  onRetry?: () => void;
  onSelectBranch: (sourceBranch: string) => void;
  open: boolean;
  placeholder: string;
  remoteGroupLabel: string;
  retryLabel: string;
  selectedBranch: string;
  worktreeGroupLabel: string;
  errorMessage?: string;
};

/**
 * Renders the source-branch selector inline so it stays within the workspace-create modal stack.
 */
export function WorkspaceCreateSourceBranchSelector({
  emptyLabel,
  errorMessage,
  groups,
  isDisabled,
  isLoading,
  loadingLabel,
  localGroupLabel,
  manualEntryPlaceholder,
  onChangeBranchText,
  onClose,
  onOpen,
  onRetry,
  onSelectBranch,
  open,
  placeholder,
  remoteGroupLabel,
  retryLabel,
  selectedBranch,
  worktreeGroupLabel,
}: WorkspaceCreateSourceBranchSelectorProps) {
  const theme = useTheme();
  const isExpanded = open && !isDisabled;
  const sourceBranchSections = resolveWorkspaceCreateSourceBranchSections(groups, {
    localBranches: localGroupLabel,
    remoteBranches: remoteGroupLabel,
    worktreeBranches: worktreeGroupLabel,
  });

  return (
    <YStack style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        disabled={isDisabled}
        onPress={isExpanded ? onClose : onOpen}
        style={({ pressed }) => ({
          opacity: isDisabled ? 1 : pressed ? 0.72 : 1,
        })}
      >
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
          <GitBranch color="$gray11" size={16} />
          <Text
            color={selectedBranch ? "$color" : "$gray11"}
            fontSize="$6"
            fontWeight="500"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {selectedBranch || placeholder}
          </Text>
          {!isDisabled ? (
            <ChevronDown
              color="$color11"
              size={18}
              style={{ transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] }}
            />
          ) : null}
        </XStack>
      </Pressable>

      {isExpanded ? (
        <YStack
          style={{
            backgroundColor: theme.gray2.val,
            borderColor: theme.gray7.val,
            borderRadius: MOBILE_UI_TOKENS.radius.input,
            borderWidth: 1,
            gap: 12,
            padding: 12,
          }}
        >
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onChangeBranchText}
            placeholder={manualEntryPlaceholder}
            value={selectedBranch}
          />

          {isLoading ? (
            <XStack style={{ alignItems: "center", gap: 10, paddingVertical: 6 }}>
              <Spinner size="small" />
              <Text color="$gray11">{loadingLabel}</Text>
            </XStack>
          ) : null}

          {!isLoading && errorMessage ? (
            <XStack style={{ alignItems: "center", gap: 10 }}>
              <Paragraph color="$red10" style={{ flex: 1 }}>
                {errorMessage}
              </Paragraph>
              {onRetry ? (
                <Button chromeless fontSize="$4" onPress={onRetry}>
                  {retryLabel}
                </Button>
              ) : null}
            </XStack>
          ) : null}

          {!isLoading && !errorMessage && sourceBranchSections.length === 0 ? (
            <Paragraph color="$gray11">{emptyLabel}</Paragraph>
          ) : null}

          {!isLoading && !errorMessage && sourceBranchSections.length > 0 ? (
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 240 }}>
              <YStack style={{ gap: 10 }}>
                {sourceBranchSections.map((section) => (
                  <YStack key={section.key} style={{ gap: 6 }}>
                    <Text color="$gray11" fontSize="$4" fontWeight="600">
                      {section.label}
                    </Text>
                    <YStack style={{ gap: 6 }}>
                      {section.branches.map((branch) => {
                        const selected = branch === selectedBranch;

                        return (
                          <Pressable key={branch} accessibilityRole="button" onPress={() => onSelectBranch(branch)}>
                            <XStack
                              style={{
                                alignItems: "center",
                                backgroundColor: selected ? theme.gray3.val : "transparent",
                                borderRadius: MOBILE_UI_TOKENS.radius.row,
                                gap: 12,
                                minHeight: 52,
                                paddingHorizontal: 14,
                                paddingVertical: 12,
                              }}
                            >
                              <GitBranch color="$gray11" size={14} />
                              <Text fontSize="$5" fontWeight="600" numberOfLines={1} style={{ flex: 1 }}>
                                {branch}
                              </Text>
                              {selected ? <Check color="$green10" size={18} /> : null}
                            </XStack>
                          </Pressable>
                        );
                      })}
                    </YStack>
                  </YStack>
                ))}
              </YStack>
            </ScrollView>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}

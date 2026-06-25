import { View } from "react-native";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { ShellQuickActionsPanel, buildPrimaryQuickActions } from "./ShellTerminalEmptyState";
import { wrapActionsWithClose } from "./shell-quick-actions-domain";

type ShellQuickActionsSheetProps = {
  agentQuickActions?: Array<{ id: string; label: string; onPress: () => void }> | null;
  onClose: () => void;
  onCreateTerminal?: (() => void) | null;
  onOpenChanges?: (() => void) | null;
  onOpenFiles?: (() => void) | null;
  onOpenPullRequests?: (() => void) | null;
  open: boolean;
};

export function ShellQuickActionsSheet({
  agentQuickActions,
  onClose,
  onCreateTerminal,
  onOpenChanges,
  onOpenFiles,
  onOpenPullRequests,
  open,
}: ShellQuickActionsSheetProps) {
  const { t } = useAppLanguage();

  const primaryActions = wrapActionsWithClose(
    buildPrimaryQuickActions({
      onCreateTerminal,
      onOpenChanges,
      onOpenFiles,
      onOpenPullRequests,
      t,
    }),
    onClose,
  );

  const wrappedAgentActions = wrapActionsWithClose(agentQuickActions, onClose);

  if (!primaryActions) {
    return null;
  }

  return (
    <AppModalSheet
      contentStyle={{ gap: 0, paddingBottom: 24, paddingTop: 12 }}
      onClose={onClose}
      open={open}
      position="bottom"
      showHandle
    >
      <View style={{ alignItems: "center" }}>
        <ShellQuickActionsPanel agentQuickActions={wrappedAgentActions} primaryActions={primaryActions} />
      </View>
    </AppModalSheet>
  );
}

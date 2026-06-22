import { SquareTerminal } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useKeyboardBottomInset } from "@/features/shell/hooks/useKeyboardBottomInset";
import { dismissActiveKeyboard } from "@/lib/accessibility/dismissActiveKeyboard";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import { PaneHeader } from "./PaneHeader";
import { SessionComposer } from "./SessionComposer";
import { ShellTerminalActivePane, getShellTerminalEmptyCopy } from "./ShellTerminalActivePane";
import { ShellTerminalEmptyState } from "./ShellTerminalEmptyState";
import { TerminalActivityIndicator } from "./TerminalActivityIndicator";
import { useShellTerminalSurfaceModel } from "./useShellTerminalSurfaceModel";

export type ShellChatModel = {
  agentQuickActions?: Array<{ id: string; label: string; onPress: () => void }> | null;
  draft: string;
  messages: TerminalMessage[];
  onCreateTerminal?: (() => void) | null;
  onDraftChange: (value: string) => void;
  onOpenChanges?: (() => void) | null;
  onOpenFiles?: (() => void) | null;
  onOpenPaneTabs?: (() => void) | null;
  onOpenPullRequests?: (() => void) | null;
  onSend: () => void;
  onTerminalInput: (data: string) => void;
  onTerminalResize: (size: { cols: number; rows: number }) => void;
  selectedTerminal: TerminalItem | null;
  selectedTerminalTitle?: string | null;
  terminalOutput: string;
};

type ShellChatSurfaceProps = {
  chat: ShellChatModel;
};

export function ShellChatSurface({ chat }: ShellChatSurfaceProps) {
  const {
    agentQuickActions,
    draft,
    messages,
    onCreateTerminal,
    onDraftChange,
    onOpenChanges,
    onOpenFiles,
    onOpenPaneTabs,
    onOpenPullRequests,
    onSend,
    onTerminalInput,
    onTerminalResize,
    selectedTerminal,
    selectedTerminalTitle,
    terminalOutput,
  } = chat;
  const { t } = useAppLanguage();
  const keyboardBottomInset = useKeyboardBottomInset();
  const {
    blurRequestToken,
    displayOutput,
    focusRequestToken,
    keyboardVisible,
    nativeStreamKey,
    requestBlur,
    requestFocus,
    resizeRequestToken,
    scrollbarThumbColor,
    terminalDomProps,
    terminalHandleRef,
    terminalTheme,
    usesTerminalEmulator,
    viewportBottomInset,
  } = useShellTerminalSurfaceModel({
    keyboardBottomInset,
    selectedTerminal,
    terminalOutput,
  });
  const dismissKeyboard = () => {
    requestBlur();
    dismissActiveKeyboard();
  };

  if (!selectedTerminal) {
    return (
      <ShellTerminalEmptyState
        agentQuickActions={agentQuickActions}
        onCreateTerminal={onCreateTerminal}
        onOpenChanges={onOpenChanges}
        onOpenFiles={onOpenFiles}
        onOpenPullRequests={onOpenPullRequests}
      />
    );
  }

  const isComposerDisabled =
    !selectedTerminal.session?.sessionId ||
    selectedTerminal.session.status === "exited" ||
    selectedTerminal.status === "initializing";
  const { emptyDescription, emptyStatusLabel } = getShellTerminalEmptyCopy(selectedTerminal, t);

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <PaneHeader
        leadingIcon={<SquareTerminal color="$color11" size={15} />}
        onPress={() => {
          dismissKeyboard();
          onOpenPaneTabs?.();
        }}
        title={selectedTerminalTitle ?? selectedTerminal.label}
        trailing={<TerminalActivityIndicator status={selectedTerminal.status} terminalId={selectedTerminal.id} />}
        typeLabel={t("shell.terminal")}
      />

      <ShellTerminalActivePane
        blurRequestToken={blurRequestToken}
        displayOutput={displayOutput}
        emptyDescription={emptyDescription}
        emptyStatusLabel={emptyStatusLabel}
        focusRequestToken={focusRequestToken}
        isComposerDisabled={isComposerDisabled}
        keyboardVisible={keyboardVisible}
        keyboardViewportInset={viewportBottomInset}
        messages={messages}
        onTerminalInput={onTerminalInput}
        onTerminalResize={onTerminalResize}
        onDismissKeyboard={dismissKeyboard}
        requestFocus={requestFocus}
        resizeRequestToken={resizeRequestToken}
        scrollbarThumbColor={scrollbarThumbColor}
        selectedTerminal={selectedTerminal}
        streamKey={nativeStreamKey ?? selectedTerminal.id}
        terminalDomProps={terminalDomProps}
        terminalHandleRef={terminalHandleRef}
        terminalOutput={terminalOutput}
        terminalTheme={terminalTheme}
        usesTerminalEmulator={usesTerminalEmulator}
      />
      {!usesTerminalEmulator ? (
        <ComposerContainer>
          <SessionComposer
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            sendDisabled={isComposerDisabled}
          />
        </ComposerContainer>
      ) : null}
    </View>
  );
}

function ComposerContainer({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderTopColor: theme.gray5.val,
        borderTopWidth: 1,
        gap: 12,
        paddingBottom: MOBILE_UI_TOKENS.pane.bodyBottom,
        paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX,
        paddingTop: MOBILE_UI_TOKENS.pane.bodyTop,
      }}
    >
      {children}
    </View>
  );
}

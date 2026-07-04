import { ChevronDown, ChevronUp, Keyboard as KeyboardIcon, SquareTerminal } from "@tamagui/lucide-icons";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useKeyboardBottomInset } from "@/features/shell/hooks/useKeyboardBottomInset";
import { dismissActiveKeyboard } from "@/lib/accessibility/dismissActiveKeyboard";
import type { ShellChatModel } from "../shell-screen.types";
import { PaneHeader } from "./PaneHeader";
import { SessionComposer, type SessionComposerHandle } from "./SessionComposer";
import { ShellNativeTerminalKeyBar } from "./ShellNativeTerminalKeyBar";
import { ShellTerminalActivePane, getShellTerminalEmptyCopy } from "./ShellTerminalActivePane";
import { ShellTerminalEmptyState } from "./ShellTerminalEmptyState";
import { TerminalActivityIndicator } from "./TerminalActivityIndicator";
import { useShellTerminalSurfaceModel } from "./useShellTerminalSurfaceModel";

type ShellChatSurfaceProps = {
  chat: ShellChatModel;
  onRegisterKeyboardDismissHandler?: ((handler: (() => void) | null) => void) | null;
};

export function ShellChatSurface({ chat, onRegisterKeyboardDismissHandler }: ShellChatSurfaceProps) {
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
    workspaceLocalPath,
  } = chat;
  const { t } = useAppLanguage();
  const [nativeControlBarExpanded, setNativeControlBarExpanded] = useState(false);
  const nativeComposerRef = useRef<SessionComposerHandle | null>(null);
  const keyboardBottomInset = useKeyboardBottomInset();
  const {
    blurRequestToken,
    composerBottomInset,
    displayOutput,
    keyboardVisible,
    nativeStreamKey,
    requestBlur,
    resizeRequestToken,
    scrollbarThumbColor,
    terminalDomProps,
    terminalTheme,
    usesTerminalEmulator,
    viewportBottomInset,
  } = useShellTerminalSurfaceModel({
    keyboardBottomInset,
    selectedTerminal,
    terminalOutput,
  });
  const dismissKeyboard = useCallback(() => {
    requestBlur();
    dismissActiveKeyboard();
  }, [requestBlur]);

  useEffect(() => {
    onRegisterKeyboardDismissHandler?.(dismissKeyboard);

    return () => {
      onRegisterKeyboardDismissHandler?.(null);
    };
  }, [onRegisterKeyboardDismissHandler, dismissKeyboard]);

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
      <View style={styles.headerContainer}>
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
        {keyboardVisible ? (
          <Pressable accessibilityLabel="Dismiss keyboard" onPress={dismissKeyboard} style={styles.dismissOverlay} />
        ) : null}
      </View>

      <ShellTerminalActivePane
        blurRequestToken={blurRequestToken}
        displayOutput={displayOutput}
        emptyDescription={emptyDescription}
        emptyStatusLabel={emptyStatusLabel}
        isComposerDisabled={isComposerDisabled}
        keyboardVisible={keyboardVisible}
        keyboardViewportInset={viewportBottomInset}
        messages={messages}
        onTerminalInput={onTerminalInput}
        onTerminalResize={onTerminalResize}
        onDismissKeyboard={dismissKeyboard}
        resizeRequestToken={resizeRequestToken}
        scrollbarThumbColor={scrollbarThumbColor}
        selectedTerminal={selectedTerminal}
        streamKey={nativeStreamKey ?? selectedTerminal.id}
        terminalDomProps={terminalDomProps}
        terminalOutput={terminalOutput}
        terminalTheme={terminalTheme}
        usesTerminalEmulator={usesTerminalEmulator}
        workspaceLocalPath={workspaceLocalPath}
      />
      {!usesTerminalEmulator ? (
        <ComposerContainer bottomInset={composerBottomInset}>
          <NativeTerminalControlsToggle
            expanded={nativeControlBarExpanded}
            onPress={() => {
              setNativeControlBarExpanded((current) => !current);
            }}
          />
          {nativeControlBarExpanded ? (
            <ShellNativeTerminalKeyBar
              disabled={isComposerDisabled}
              getLabel={(labelKey) => t(labelKey)}
              onFocusKeyboard={() => {
                nativeComposerRef.current?.focus();
              }}
              onPressKey={onTerminalInput}
              showTopBorder={false}
            />
          ) : null}
          <SessionComposer
            ref={nativeComposerRef}
            compact
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            sendDisabled={isComposerDisabled}
            showLeadingAction={false}
          />
        </ComposerContainer>
      ) : null}
    </View>
  );
}

function ComposerContainer({
  bottomInset,
  children,
}: {
  bottomInset: number;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderTopColor: theme.gray5.val,
        borderTopWidth: 1,
        gap: 8,
        paddingBottom: MOBILE_UI_TOKENS.pane.bodyBottom + bottomInset,
        paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX,
        paddingTop: 10,
      }}
    >
      {children}
    </View>
  );
}

function NativeTerminalControlsToggle({
  expanded,
  onPress,
}: {
  expanded: boolean;
  onPress: () => void;
}) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <Pressable
      accessibilityLabel={expanded ? t("shell.terminalControlsCollapse") : t("shell.terminalControlsExpand")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: theme.gray2.val,
        borderColor: theme.gray5.val,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
        gap: 8,
        justifyContent: "space-between",
        minHeight: 34,
        opacity: pressed ? 0.85 : 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
      })}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <KeyboardIcon color="$gray11" size={16} />
        <Text color="$gray11" fontSize="$3" fontWeight="600">
          {t("shell.terminalControls")}
        </Text>
      </View>
      <ChevronIcon color="$gray11" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 10,
  },
  headerContainer: {
    position: "relative",
  },
});

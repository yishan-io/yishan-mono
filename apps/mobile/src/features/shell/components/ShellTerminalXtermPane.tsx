import { APP_MODAL_SHEET_CLOSE_ANIMATION_MS } from "@/components/ui/AppModalSheet";
import { useQueryClient } from "@tanstack/react-query";
import type { ITheme } from "@xterm/xterm";
import * as Clipboard from "expo-clipboard";
import type { DOMProps } from "expo/dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { writeRelayWorkspaceFile } from "@/features/workspaces/workspaces.relay";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import ShellTerminalDomEmulator, { type ShellTerminalDomEmulatorHandle } from "./ShellTerminalDomEmulator";
import { ShellTerminalKeyboardBridgeInput } from "./ShellTerminalKeyboardBridgeInput";
import { ShellTerminalReaderPane } from "./ShellTerminalReaderPane";
import { ShellTerminalXtermAccessory } from "./ShellTerminalXtermAccessory";
import { getTerminalAccessoryBottomInset } from "./shell-terminal-active-pane-domain";
import {
  type TerminalUploadImageSource,
  pickTerminalUploadImage,
} from "./shell-terminal-native-upload-domain";
import {
  buildTerminalUploadAbsolutePath,
  buildTerminalUploadRelativePath,
  escapePathForShell,
} from "./shell-terminal-upload-domain";
type ShellTerminalXtermPaneProps = {
  blurRequestToken: number;
  isComposerDisabled: boolean;
  keyboardVisible: boolean;
  keyboardViewportInset: number;
  messages: TerminalMessage[];
  onDismissKeyboard: () => void;
  onTerminalInput: (data: string) => void;
  onTerminalResize: (size: { cols: number; rows: number }) => void;
  resizeRequestToken: number;
  scrollbarThumbColor: string;
  selectedTerminal: TerminalItem;
  streamKey: string;
  terminalDomProps?: DOMProps;
  terminalOutput: string;
  terminalTheme: ITheme;
  workspaceLocalPath?: string | null;
};

/** Renders the xterm-backed terminal surface used on native when the emulator is enabled. */
export function ShellTerminalXtermPane({
  blurRequestToken,
  isComposerDisabled,
  keyboardVisible,
  keyboardViewportInset,
  messages,
  onDismissKeyboard,
  onTerminalInput,
  onTerminalResize,
  resizeRequestToken,
  scrollbarThumbColor,
  selectedTerminal,
  streamKey,
  terminalDomProps,
  terminalOutput,
  terminalTheme,
  workspaceLocalPath,
}: ShellTerminalXtermPaneProps) {
  const { t } = useAppLanguage();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const accessoryBottomInset = getTerminalAccessoryBottomInset(keyboardViewportInset);
  const nativeKeyboardInputRef = useRef<TextInput | null>(null);
  const nativeKeyboardInputValueRef = useRef("");
  const terminalDomRef = useRef<ShellTerminalDomEmulatorHandle | null>(null);
  const imageUploadSheetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clipboardText, setClipboardText] = useState("");
  const [imageUploadSheetOpen, setImageUploadSheetOpen] = useState(false);
  const [nativeKeyboardInputValue, setNativeKeyboardInputValue] = useState("");
  const [readerModeEnabled, setReaderModeEnabled] = useState(false);

  const focusNativeKeyboardInput = () => {
    nativeKeyboardInputValueRef.current = "";
    setNativeKeyboardInputValue("");
    nativeKeyboardInputRef.current?.focus();
  };

  const dismissTerminalKeyboard = () => {
    nativeKeyboardInputValueRef.current = "";
    setNativeKeyboardInputValue("");
    nativeKeyboardInputRef.current?.blur();
    terminalDomRef.current?.blurInputSession();
    onDismissKeyboard();
  };

  const handleTerminalTapInputSession = (inputSessionActive: boolean) => {
    if (readerModeEnabled) {
      return;
    }

    if (inputSessionActive || keyboardVisible) {
      dismissTerminalKeyboard();
      return;
    }

    if (!isComposerDisabled) {
      focusNativeKeyboardInput();
    }
  };

  const resetNativeKeyboardInput = () => {
    nativeKeyboardInputValueRef.current = "";
    setNativeKeyboardInputValue("");
  };

  const pasteFromClipboard = async () => {
    const text = clipboardText || (await Clipboard.getStringAsync());
    if (!text) {
      return;
    }

    terminalDomRef.current?.pasteText(text);
  };

  const refreshClipboardState = useCallback(async () => {
    const nextClipboardText = await Clipboard.getStringAsync();
    setClipboardText(nextClipboardText);
  }, []);

  const openReaderMode = () => {
    dismissTerminalKeyboard();
    setReaderModeEnabled(true);
  };

  const closeReaderMode = () => {
    setReaderModeEnabled(false);
    focusNativeKeyboardInput();
  };

  const insertTerminalImagePath = async (pickedImage: {
    base64Data: string;
    fileName: string;
    mimeType: string;
  }) => {
    const accessToken = session?.accessToken;
    const nodeId = selectedTerminal.nodeId?.trim() ?? "";
    const normalizedWorkspaceLocalPath = workspaceLocalPath?.trim() ?? "";
    if (!accessToken || !nodeId || !normalizedWorkspaceLocalPath) {
      return;
    }

    const relativePath = buildTerminalUploadRelativePath(pickedImage.fileName, pickedImage.mimeType);
    await writeRelayWorkspaceFile({
      accessToken,
      content: pickedImage.base64Data,
      encoding: "base64",
      nodeId,
      path: relativePath,
      workspaceId: selectedTerminal.workspaceId,
    });
    await queryClient.invalidateQueries({
      queryKey: [
        "organizations",
        selectedTerminal.orgId,
        "projects",
        selectedTerminal.projectId,
        "workspaces",
        selectedTerminal.workspaceId,
        "nodes",
        nodeId,
      ],
    });

    const absolutePath = buildTerminalUploadAbsolutePath(normalizedWorkspaceLocalPath, relativePath);
    onTerminalInput(`${escapePathForShell(absolutePath)} `);
    focusNativeKeyboardInput();
  };

  const pickAndInsertImagePath = async (source: TerminalUploadImageSource) => {
    const pickedImage = await pickTerminalUploadImage(source);
    if (!pickedImage) {
      return;
    }

    await insertTerminalImagePath(pickedImage);
  };

  const openImageUploadSheet = () => {
    dismissTerminalKeyboard();
    setImageUploadSheetOpen(true);
  };

  const closeImageUploadSheet = () => {
    setImageUploadSheetOpen(false);
  };

  const handleImageUploadAction = (source: TerminalUploadImageSource) => {
    closeImageUploadSheet();
    if (imageUploadSheetTimeoutRef.current) {
      clearTimeout(imageUploadSheetTimeoutRef.current);
    }

    imageUploadSheetTimeoutRef.current = setTimeout(() => {
      imageUploadSheetTimeoutRef.current = null;
      void pickAndInsertImagePath(source);
    }, APP_MODAL_SHEET_CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    if (!keyboardVisible) {
      nativeKeyboardInputRef.current?.blur();
    }
  }, [keyboardVisible]);

  useEffect(() => {
    if (readerModeEnabled || imageUploadSheetOpen) {
      return;
    }

    void refreshClipboardState();
  }, [imageUploadSheetOpen, readerModeEnabled, refreshClipboardState]);

  useEffect(
    () => () => {
      if (imageUploadSheetTimeoutRef.current) {
        clearTimeout(imageUploadSheetTimeoutRef.current);
        imageUploadSheetTimeoutRef.current = null;
      }
    },
    [],
  );
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {readerModeEnabled ? (
          <ShellTerminalReaderPane
            emptyDescription={t("shell.terminalInputPlaceholder")}
            emptyStatusLabel={t("shell.terminalReaderMode")}
            onExit={closeReaderMode}
            output={terminalOutput}
            selectedTerminal={selectedTerminal}
          />
        ) : (
          <ShellTerminalDomEmulator
            blurRequestToken={blurRequestToken}
            dom={terminalDomProps}
            ref={terminalDomRef}
            onInput={async (data) => onTerminalInput(data)}
            onTapInputSession={handleTerminalTapInputSession}
            onResize={async (size) => onTerminalResize(size)}
            output={terminalOutput}
            resizeRequestToken={resizeRequestToken}
            scrollbarThumbColor={scrollbarThumbColor}
            streamKey={streamKey}
            terminalId={selectedTerminal.id}
            terminalTheme={terminalTheme}
          />
        )}
        <ShellTerminalKeyboardBridgeInput
          inputValue={nativeKeyboardInputValue}
          inputValueRef={nativeKeyboardInputValueRef}
          onTerminalInput={onTerminalInput}
          resetInput={resetNativeKeyboardInput}
          textInputRef={nativeKeyboardInputRef}
        />
      </View>
      <ShellTerminalXtermAccessory
        accessoryBottomInset={accessoryBottomInset}
        clipboardText={clipboardText}
        imageUploadSheetOpen={imageUploadSheetOpen}
        isComposerDisabled={isComposerDisabled}
        keyboardVisible={keyboardVisible}
        messages={messages}
        onCloseImageUploadSheet={closeImageUploadSheet}
        onDismissKeyboard={dismissTerminalKeyboard}
        onFocusKeyboard={focusNativeKeyboardInput}
        onImageUploadAction={handleImageUploadAction}
        onOpenImageUploadSheet={openImageUploadSheet}
        onOpenReaderMode={openReaderMode}
        onPressKey={(input) => onTerminalInput(input)}
        onPressPaste={pasteFromClipboard}
        readerModeEnabled={readerModeEnabled}
        t={(labelKey) => t(labelKey)}
      />
    </View>
  );
}

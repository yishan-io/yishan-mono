import { BookText, Image } from "@tamagui/lucide-icons";
import { Platform, Pressable, View } from "react-native";

import { PaneBody } from "@/components/ui/PaneBody";
import type { TerminalMessage } from "../state/shell.types";
import { ShellMessageTimeline } from "./ShellMessageTimeline";
import { ShellNativeTerminalKeyBar } from "./ShellNativeTerminalKeyBar";
import { ShellTerminalUploadImageSheet } from "./ShellTerminalUploadImageSheet";
import type { TerminalUploadImageSource } from "./shell-terminal-native-upload-domain";

type ShellTerminalXtermAccessoryProps = {
  accessoryBottomInset: number;
  clipboardText: string;
  imageUploadSheetOpen: boolean;
  isComposerDisabled: boolean;
  keyboardVisible: boolean;
  messages: TerminalMessage[];
  onCloseImageUploadSheet: () => void;
  onDismissKeyboard: () => void;
  onFocusKeyboard: () => void;
  onImageUploadAction: (source: TerminalUploadImageSource) => void;
  onOpenImageUploadSheet: () => void;
  onOpenReaderMode: () => void;
  onPressKey: (input: string) => void;
  onPressPaste: () => Promise<void>;
  readerModeEnabled: boolean;
  t: (labelKey: string) => string;
};

/** Renders the mobile xterm accessory area, including controls and upload sheet. */
export function ShellTerminalXtermAccessory({
  accessoryBottomInset,
  clipboardText,
  imageUploadSheetOpen,
  isComposerDisabled,
  keyboardVisible,
  messages,
  onCloseImageUploadSheet,
  onDismissKeyboard,
  onFocusKeyboard,
  onImageUploadAction,
  onOpenImageUploadSheet,
  onOpenReaderMode,
  onPressKey,
  onPressPaste,
  readerModeEnabled,
  t,
}: ShellTerminalXtermAccessoryProps) {
  const showTimeline = messages.length > 0;

  return (
    <>
      {showTimeline || Platform.OS !== "web" ? (
        <View
          style={{
            flexShrink: 0,
            marginBottom: accessoryBottomInset,
          }}
        >
          {showTimeline && !readerModeEnabled ? (
            <Pressable onPress={onDismissKeyboard} style={{ flexShrink: 0 }}>
              <PaneBody
                style={{
                  paddingBottom: keyboardVisible ? 12 : 16,
                  paddingTop: 16,
                }}
              >
                <ShellMessageTimeline messages={messages} />
              </PaneBody>
            </Pressable>
          ) : null}
          {Platform.OS !== "web" && !readerModeEnabled ? (
            <ShellNativeTerminalKeyBar
              fixedLeadingAction={{
                accessibilityLabel: t("shell.terminalReaderMode"),
                icon: <BookText color="$gray11" size={16} />,
                keepKeyboardFocused: false,
                onPress: onOpenReaderMode,
              }}
              actions={[
                {
                  accessibilityLabel: t("shell.terminalUploadImage"),
                  icon: <Image color="$gray11" size={16} />,
                  id: "upload-image",
                  keepKeyboardFocused: false,
                  onPress: onOpenImageUploadSheet,
                },
                ...(clipboardText
                  ? [
                      {
                        accessibilityLabel: t("shell.terminalActionPaste"),
                        id: "paste",
                        label: t("shell.terminalActionPaste"),
                        onPress: onPressPaste,
                      },
                    ]
                  : []),
              ]}
              disabled={isComposerDisabled}
              getLabel={(labelKey) => t(labelKey)}
              onFocusKeyboard={onFocusKeyboard}
              onPressKey={onPressKey}
            />
          ) : null}
        </View>
      ) : null}
      <ShellTerminalUploadImageSheet
        chooseFileLabel={t("shell.terminalUploadImageChooseFile")}
        onChooseFile={() => onImageUploadAction("file")}
        onClose={onCloseImageUploadSheet}
        onOpenPhotoLibrary={() => onImageUploadAction("photo-library")}
        onTakePhoto={() => onImageUploadAction("camera")}
        open={imageUploadSheetOpen}
        photoLibraryLabel={t("shell.terminalUploadImagePhotoLibrary")}
        takePhotoLabel={t("shell.terminalUploadImageTakePhoto")}
        title={t("shell.terminalUploadImage")}
      />
    </>
  );
}

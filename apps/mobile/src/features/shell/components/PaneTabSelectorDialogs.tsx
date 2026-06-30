import { TextInput } from "react-native";
import { Button, Text, XStack, useTheme } from "tamagui";

import { SheetInlineDialog } from "@/components/ui/SheetInlineDialog";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { TerminalItem } from "../state/shell.types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type PaneTabSelectorDialogsProps = {
  actionTerminal: TerminalItem | null;
  closeActionDialog: () => void;
  closeRenameDialog: () => void;
  closeTerminal: (terminalId: string) => void;
  openRenameDialog: (terminalId: string) => void;
  renameTerminal: TerminalItem | null;
  renameTitle: string;
  renameValue: string;
  setRenameValue: (value: string) => void;
  submitRename: () => void;
  t: Translate;
};

export function PaneTabSelectorDialogs({
  actionTerminal,
  closeActionDialog,
  closeRenameDialog,
  closeTerminal,
  openRenameDialog,
  renameTerminal,
  renameTitle,
  renameValue,
  setRenameValue,
  submitRename,
  t,
}: PaneTabSelectorDialogsProps) {
  const theme = useTheme();

  return (
    <>
      {actionTerminal ? (
        <SheetInlineDialog onClose={closeActionDialog}>
          <Text fontSize="$7" fontWeight="700" numberOfLines={1} style={{ textAlign: "center" }}>
            {actionTerminal.label}
          </Text>
          <Button themeInverse onPress={() => openRenameDialog(actionTerminal.id)}>
            {t("shell.renameTerminal")}
          </Button>
          <Button
            onPress={() => {
              closeTerminal(actionTerminal.id);
              closeActionDialog();
            }}
          >
            {t("shell.closeTab")}
          </Button>
          <Button chromeless onPress={closeActionDialog}>
            {t("common.cancel")}
          </Button>
        </SheetInlineDialog>
      ) : null}

      {renameTerminal ? (
        <SheetInlineDialog onClose={closeRenameDialog}>
          <Text fontSize="$7" fontWeight="700">
            {t("shell.renameTerminalTitle")}
          </Text>
          <Text color="$gray11" fontSize="$3">
            {renameTitle}
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setRenameValue}
            placeholder={t("shell.renameTerminalPlaceholder")}
            style={{
              backgroundColor: theme.gray2.val,
              borderColor: theme.gray5.val,
              borderRadius: MOBILE_UI_TOKENS.radius.input,
              borderWidth: 1,
              color: theme.color.val,
              fontSize: 16,
              paddingHorizontal: MOBILE_UI_TOKENS.sheet.rowInsetX,
              paddingVertical: 12,
            }}
            value={renameValue}
          />
          <XStack style={{ gap: 10, justifyContent: "flex-end" }}>
            <Button onPress={closeRenameDialog}>{t("common.cancel")}</Button>
            <Button disabled={!renameValue.trim()} themeInverse onPress={submitRename}>
              {t("shell.renameTerminalConfirm")}
            </Button>
          </XStack>
        </SheetInlineDialog>
      ) : null}
    </>
  );
}

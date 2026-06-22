import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { View } from "react-native";
import { Button, Text } from "tamagui";

type WorkspaceEntryMenuSheetProps = {
  entryName: string;
  actions: Array<{
    destructive?: boolean;
    disabled?: boolean;
    label: string;
    onPress: () => void;
  }>;
  onClose: () => void;
  open: boolean;
};

export function WorkspaceEntryMenuSheet({ actions, entryName, onClose, open }: WorkspaceEntryMenuSheetProps) {
  return (
    <AppModalSheet open={open} onClose={onClose} position="bottom">
      {entryName ? (
        <Text fontSize="$7" fontWeight="700" numberOfLines={1}>
          {entryName}
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        {actions.map((action) => (
          <Button
            key={action.label}
            disabled={action.disabled}
            onPress={() => {
              if (action.disabled) {
                return;
              }

              action.onPress();
              onClose();
            }}
            themeInverse={!action.destructive}
          >
            {action.label}
          </Button>
        ))}
      </View>
    </AppModalSheet>
  );
}

import { View } from "react-native";
import { Button, Text } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";

type ActionMenuSheetProps = {
  actions: Array<{ destructive?: boolean; label: string; onPress: () => void }>;
  onClose: () => void;
  open: boolean;
  title: string;
};

// Owns only sheet presentation for delegated project/workspace actions.
export function ActionMenuSheet({ actions, onClose, open, title }: ActionMenuSheetProps) {
  return (
    <AppModalSheet open={open} onClose={onClose} position="bottom">
      {title ? (
        <Text fontSize="$7" fontWeight="700" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        {actions.map((action) => (
          <Button key={action.label} themeInverse={!action.destructive} onPress={action.onPress}>
            {action.label}
          </Button>
        ))}
      </View>
    </AppModalSheet>
  );
}

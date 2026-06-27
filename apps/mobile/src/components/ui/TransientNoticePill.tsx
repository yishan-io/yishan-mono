import { View } from "react-native";
import { Text, useTheme } from "tamagui";

type TransientNoticePillProps = {
  label: string;
};

/** Renders a short-lived inline success notice using the shared pill styling. */
export function TransientNoticePill({ label }: TransientNoticePillProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignSelf: "center",
        backgroundColor: theme.color3.val,
        borderColor: theme.color6.val,
        borderRadius: 999,
        borderWidth: 1,
        marginBottom: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text color="$color11" fontSize="$3" fontWeight="500">
        {label}
      </Text>
    </View>
  );
}

import { View } from "react-native";
import { Text } from "tamagui";

type TransientNoticePillProps = {
  label: string;
};

/** Renders a short-lived inline success notice using the shared pill styling. */
export function TransientNoticePill({ label }: TransientNoticePillProps) {
  return (
    <View
      style={{
        alignSelf: "center",
        marginBottom: 12,
      }}
    >
      <Text color="$gray11" fontSize="$3" fontWeight="500">
        {label}
      </Text>
    </View>
  );
}

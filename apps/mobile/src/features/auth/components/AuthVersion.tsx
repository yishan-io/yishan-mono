import { Paragraph, YStack } from "tamagui";

type AuthVersionProps = {
  version: string;
};

export function AuthVersion({ version }: AuthVersionProps) {
  return (
    <YStack style={{ alignItems: "center", paddingTop: 24 }}>
      <Paragraph size="$4" color="$gray10">
        v{version}
      </Paragraph>
    </YStack>
  );
}

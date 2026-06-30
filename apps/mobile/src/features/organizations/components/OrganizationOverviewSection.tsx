import { Paragraph, Text, XStack, YStack, useTheme } from "tamagui";

import { SectionCard } from "@/components/ui/SectionCard";

type Metric = {
  label: string;
  value: string;
};

export function OrganizationOverviewSection({
  metrics,
  title,
}: {
  metrics: Metric[];
  title: string;
}) {
  return (
    <YStack style={{ gap: 8 }}>
      <Text fontSize="$7" fontWeight="700">
        {title}
      </Text>
      <SectionCard>
        <YStack style={{ gap: 14, paddingHorizontal: 16, paddingVertical: 16 }}>
          <XStack style={{ flexWrap: "wrap", gap: 12 }}>
            {metrics.map((metric) => (
              <OverviewMetric key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </XStack>
        </YStack>
      </SectionCard>
    </YStack>
  );
}

function OverviewMetric({ label, value }: Metric) {
  const theme = useTheme();

  return (
    <YStack
      style={{
        backgroundColor: theme.gray3.val,
        borderRadius: 14,
        flexGrow: 1,
        gap: 8,
        minWidth: 96,
        paddingHorizontal: 14,
        paddingVertical: 14,
      }}
    >
      <Paragraph size="$3" style={{ color: theme.gray10.val }}>
        {label}
      </Paragraph>
      <Text fontSize="$8" fontWeight="700">
        {value}
      </Text>
    </YStack>
  );
}

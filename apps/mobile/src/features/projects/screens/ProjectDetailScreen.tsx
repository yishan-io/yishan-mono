import { View } from "react-native";
import { Paragraph, Text, YStack, useTheme } from "tamagui";

import { ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { SectionCard } from "@/components/ui/SectionCard";
import { useProjectDetailModel } from "@/features/projects/hooks/useProjectDetailModel";

export function ProjectDetailScreen() {
  const theme = useTheme();
  const model = useProjectDetailModel();

  if (model.projectQuery.isLoading) {
    return <LoadingView label={model.t("shell.loadingProject")} />;
  }

  if (model.projectQuery.isError) {
    return <ErrorState onRetry={() => void model.projectQuery.refetch()} />;
  }

  if (!model.project) {
    return <ErrorState onRetry={() => void model.projectQuery.refetch()} />;
  }

  return (
    <ScreenScaffold
      backButtonVariant="close"
      onBack={model.onBack}
      subtitle={model.t("shell.projectMetadata")}
      title={model.project.name || model.t("shell.projectFallbackTitle")}
    >
      <YStack style={{ gap: 20, paddingBottom: 24, paddingTop: 12 }}>
        <YStack style={{ gap: 4, paddingHorizontal: 4 }}>
          <Text fontSize="$6" fontWeight="700">
            {model.t("shell.projectMetadata")}
          </Text>
          <Paragraph size="$3" style={{ color: theme.gray10.val }}>
            {model.summary}
          </Paragraph>
        </YStack>

        <SectionCard>
          {model.rows.map((row, index) => (
            <View
              key={row.label}
              style={{
                borderBottomColor: index === model.rows.length - 1 ? "transparent" : theme.borderColor.val,
                borderBottomWidth: index === model.rows.length - 1 ? 0 : 1,
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
            >
              <Text color="$gray11" fontSize="$3" fontWeight="600">
                {row.label}
              </Text>
              <Paragraph>{row.value}</Paragraph>
            </View>
          ))}
        </SectionCard>

        <YStack style={{ gap: 4, paddingHorizontal: 4 }}>
          <Text fontSize="$6" fontWeight="700">
            {model.t("shell.contextEnabled")}
          </Text>
          <Paragraph size="$3" style={{ color: theme.gray10.val }}>
            {model.t("shell.contextDescription")}
          </Paragraph>
        </YStack>
      </YStack>
    </ScreenScaffold>
  );
}

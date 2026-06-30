import { View } from "react-native";
import { Paragraph, Separator, Text, XStack, YStack, useTheme } from "tamagui";

import { SectionCard } from "@/components/ui/SectionCard";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { Node } from "@/features/nodes/nodes.types";
import { NodeGlyph } from "./NodeGlyph";

export function NodesListCard({ nodes }: { nodes: Node[] }) {
  const { t } = useAppLanguage();

  if (nodes.length === 0) {
    return <Paragraph>{t("settings.nodesEmpty")}</Paragraph>;
  }

  return (
    <SectionCard>
      <YStack>
        {nodes.map((node, index) => (
          <View key={node.id}>
            {index > 0 ? <Separator /> : null}
            <NodeRow node={node} />
          </View>
        ))}
      </YStack>
    </SectionCard>
  );
}

function NodeRow({ node }: { node: Node }) {
  const theme = useTheme();
  const { t } = useAppLanguage();

  return (
    <XStack style={{ alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.gray3.val,
          borderRadius: 999,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <NodeGlyph color={node.isOnline ? "$green10" : "$gray10"} kind={node.kind} scope={node.scope} size={18} />
      </View>
      <YStack style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <Text fontSize="$5" fontWeight="600" numberOfLines={1}>
          {node.name}
        </Text>
        <Paragraph numberOfLines={1} size="$2" style={{ color: theme.gray10.val }}>
          {node.isOnline ? t("shell.nodeOnline") : t("shell.nodeOffline")}
          {" · "}
          {node.scope === "shared" ? t("shell.nodeScopeShared") : t("shell.nodeScopePrivate")}
        </Paragraph>
      </YStack>
    </XStack>
  );
}

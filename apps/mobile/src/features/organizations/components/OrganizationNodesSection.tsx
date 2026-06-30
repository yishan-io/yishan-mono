import { Paragraph, Text, YStack, useTheme } from "tamagui";

import { NodesListCard } from "@/features/nodes/components/NodesListCard";
import type { Node } from "@/features/nodes/nodes.types";

export function OrganizationNodesSection({
  description,
  nodes,
  title,
}: {
  description: string;
  nodes: Node[];
  title: string;
}) {
  const theme = useTheme();

  return (
    <YStack style={{ gap: 8 }}>
      <YStack style={{ gap: 4, paddingHorizontal: 4 }}>
        <Text fontSize="$6" fontWeight="700">
          {title}
        </Text>
        <Paragraph size="$3" style={{ color: theme.gray10.val }}>
          {description}
        </Paragraph>
      </YStack>
      <NodesListCard nodes={nodes} />
    </YStack>
  );
}

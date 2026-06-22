import type { buildUnifiedDiffLines } from "@yishan/file-browser-core";
import { Text, XStack, useTheme } from "tamagui";

type WorkspaceDiffPreviewLineRowProps = {
  line: ReturnType<typeof buildUnifiedDiffLines>[number];
  minWidth: number;
};

export function WorkspaceDiffPreviewLineRow({ line, minWidth }: WorkspaceDiffPreviewLineRowProps) {
  const theme = useTheme();
  const mergedLineNumber =
    line.kind === "deleted"
      ? line.oldLineNumber
      : line.kind === "hunk"
        ? null
        : (line.newLineNumber ?? line.oldLineNumber);
  const palette =
    line.kind === "added"
      ? {
          accentColor: "$green11" as const,
          backgroundColor: theme.green3.val,
          borderColor: theme.green8.val,
          marker: "+",
        }
      : line.kind === "deleted"
        ? {
            accentColor: "$red11" as const,
            backgroundColor: theme.red3.val,
            borderColor: theme.red8.val,
            marker: "-",
          }
        : line.kind === "hunk"
          ? {
              accentColor: "$blue11" as const,
              backgroundColor: theme.blue3.val,
              borderColor: theme.blue8.val,
              marker: "@",
            }
          : {
              accentColor: "$gray11" as const,
              backgroundColor: theme.gray2.val,
              borderColor: theme.gray6.val,
              marker: " ",
            };

  return (
    <XStack
      style={{
        alignItems: "flex-start",
        backgroundColor: palette.backgroundColor,
        borderBottomColor: theme.gray4.val,
        borderBottomWidth: 1,
        borderLeftColor: palette.borderColor,
        borderLeftWidth: 3,
        gap: 4,
        minWidth,
        paddingHorizontal: 16,
        paddingVertical: 2,
      }}
    >
      <Text
        color={palette.accentColor}
        fontSize="$2"
        selectable={false}
        style={{ fontFamily: "monospace", minWidth: 8, paddingVertical: 2, textAlign: "center" }}
      >
        {palette.marker}
      </Text>
      <Text
        color="$gray10"
        fontSize="$2"
        selectable={false}
        style={{ fontFamily: "monospace", minWidth: 32, paddingVertical: 2, textAlign: "right" }}
      >
        {mergedLineNumber ?? ""}
      </Text>
      <Text
        fontSize="$3"
        lineHeight={22}
        selectable
        style={{ flex: 1, flexShrink: 0, fontFamily: "monospace", paddingVertical: 2 }}
      >
        {line.content.length > 0 ? line.content : " "}
      </Text>
    </XStack>
  );
}

import { YStack } from "tamagui";

import type { TerminalMessage } from "../state/shell.types";
import { ShellMessageTimelineItem } from "./ShellMessageTimelineItem";

export function ShellMessageTimeline({ messages }: { messages: TerminalMessage[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <YStack style={{ gap: 12 }}>
      {messages.map((message) => (
        <ShellMessageTimelineItem key={message.id} message={message} />
      ))}
    </YStack>
  );
}

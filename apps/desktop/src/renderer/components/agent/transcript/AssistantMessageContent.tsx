import type { AgentMessage } from "../../../store/agentChatTypes";
import { AgentToolCallCard } from "../tool-calls/AgentToolCallCard";
import type { CompletedSubagentOpenTarget } from "../tool-calls/helpers";
import { AgentMarkdownContent } from "./AgentMarkdownContent";
import { ThinkingBlock } from "./ThinkingBlock";
import type { AgentToolResultMap } from "./helpers";

type AssistantMessageContentProps = {
  message: AgentMessage;
  mergedToolResults: AgentToolResultMap;
  workspacePath?: string;
  isStreaming: boolean;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/** Renders assistant message blocks including markdown, thinking, and tool calls. */
export function AssistantMessageContent({
  message,
  mergedToolResults,
  workspacePath,
  isStreaming,
  onOpenCompletedSubagent,
}: AssistantMessageContentProps) {
  const blocks = Array.isArray(message.content) ? message.content : [];
  let textBlockCount = 0;
  let thinkingBlockCount = 0;

  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case "text": {
            const key = `${message.id}-text-${textBlockCount}`;
            textBlockCount += 1;
            return (
              <AgentMarkdownContent
                key={key}
                content={block.text}
                workspacePath={workspacePath}
                renderMode={isStreaming ? "streaming" : "final"}
              />
            );
          }
          case "thinking": {
            if (block.thinking.trim().length === 0) {
              return null;
            }
            const key = `${message.id}-thinking-${thinkingBlockCount}`;
            thinkingBlockCount += 1;
            return (
              <ThinkingBlock
                key={key}
                thinking={block.thinking}
                thinkingSignature={block.thinkingSignature}
                isStreaming={isStreaming}
              />
            );
          }
          case "toolCall":
            return (
              <AgentToolCallCard
                key={block.id}
                toolCall={block}
                result={mergedToolResults[block.id] ?? null}
                workspacePath={workspacePath}
                onOpenCompletedSubagent={onOpenCompletedSubagent}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

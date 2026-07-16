import { AgentToolCard } from "./toolCallCards/AgentToolCard";
import { BashToolCard } from "./toolCallCards/BashToolCard";
import { DefaultToolCard } from "./toolCallCards/DefaultToolCard";
import { DiffToolCard } from "./toolCallCards/DiffToolCard";
import { GrepToolCard } from "./toolCallCards/GrepToolCard";
import { MemorySearchToolCard } from "./toolCallCards/MemorySearchToolCard";
import { MemoryStoreToolCard } from "./toolCallCards/MemoryStoreToolCard";
import { ReadToolCard } from "./toolCallCards/ReadToolCard";
import type { AgentToolCallCardProps } from "./toolCallCards/helpers";

/** Renders one agent tool call using a specialized card per tool type. */
export function AgentToolCallCard(props: AgentToolCallCardProps) {
  switch (props.toolCall.name) {
    case "bash":
      return <BashToolCard {...props} />;
    case "read":
      return <ReadToolCard {...props} />;
    case "edit":
    case "write":
      return <DiffToolCard {...props} />;
    case "grep":
      return <GrepToolCard {...props} />;
    case "Agent":
      return <AgentToolCard {...props} />;
    case "memory_search":
      return <MemorySearchToolCard {...props} />;
    case "memory_store":
      return <MemoryStoreToolCard {...props} />;
    default:
      return <DefaultToolCard {...props} />;
  }
}

import { AgentToolCard } from "./AgentToolCard";
import { AskUserToolCard } from "./AskUserToolCard";
import { BashToolCard } from "./BashToolCard";
import { DefaultToolCard } from "./DefaultToolCard";
import { DiffToolCard } from "./DiffToolCard";
import { GrepToolCard } from "./GrepToolCard";
import { MemorySearchToolCard } from "./MemorySearchToolCard";
import { MemoryStoreToolCard } from "./MemoryStoreToolCard";
import { ReadToolCard } from "./ReadToolCard";
import { WorkspaceCloseToolCard } from "./WorkspaceCloseToolCard";
import { WorkspaceCreateToolCard } from "./WorkspaceCreateToolCard";
import { WorkspaceFindToolCard } from "./WorkspaceFindToolCard";
import { WorkspaceListToolCard } from "./WorkspaceListToolCard";
import type { AgentToolCallCardProps } from "./helpers";

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
    case "ask_user":
      return <AskUserToolCard {...props} />;
    case "workspace_list":
      return <WorkspaceListToolCard {...props} />;
    case "workspace_find":
      return <WorkspaceFindToolCard {...props} />;
    case "workspace_create":
      return <WorkspaceCreateToolCard {...props} />;
    case "workspace_close":
      return <WorkspaceCloseToolCard {...props} />;
    default:
      return <DefaultToolCard {...props} />;
  }
}

import { AgentToolCard } from "./AgentToolCard";
import { AskUserToolCard } from "./AskUserToolCard";
import { BashToolCard } from "./BashToolCard";
import { CodeGraphToolCard } from "./CodeGraphToolCard";
import { DefaultToolCard } from "./DefaultToolCard";
import { DiffToolCard } from "./DiffToolCard";
import { GrepToolCard } from "./GrepToolCard";
import { LspToolCard } from "./LspToolCard";
import { MemoryReadToolCard } from "./MemoryReadToolCard";
import { MemorySearchToolCard } from "./MemorySearchToolCard";
import { MemoryStoreToolCard } from "./MemoryStoreToolCard";
import { ReadToolCard } from "./ReadToolCard";
import { TaskToolCard } from "./TaskToolCard";
import { WebFetchToolCard } from "./WebFetchToolCard";
import { WorkspaceCloseToolCard } from "./WorkspaceCloseToolCard";
import { WorkspaceCreateToolCard } from "./WorkspaceCreateToolCard";
import { WorkspaceFindToolCard } from "./WorkspaceFindToolCard";
import { WorkspaceListToolCard } from "./WorkspaceListToolCard";
import type { AgentToolCallCardProps } from "./summary";

/** Renders one agent tool call using a specialized card per tool type. */
export function AgentToolCallCard(props: AgentToolCallCardProps) {
  switch (props.renderer.kind) {
    case "bash":
      return <BashToolCard {...props} />;
    case "read":
      return <ReadToolCard {...props} />;
    case "diff":
      return <DiffToolCard {...props} />;
    case "grep":
      return <GrepToolCard {...props} />;
    case "codeGraph":
      return <CodeGraphToolCard {...props} />;
    case "agent":
      return <AgentToolCard {...props} />;
    case "memoryRead":
      return <MemoryReadToolCard {...props} />;
    case "memorySearch":
      return <MemorySearchToolCard {...props} />;
    case "memoryStore":
      return <MemoryStoreToolCard {...props} />;
    case "askUser":
      return <AskUserToolCard {...props} />;
    case "lsp":
      return <LspToolCard {...props} />;
    case "workspace": {
      const WorkspaceCard = {
        workspace_list: WorkspaceListToolCard,
        workspace_find: WorkspaceFindToolCard,
        workspace_create: WorkspaceCreateToolCard,
        workspace_close: WorkspaceCloseToolCard,
      }[props.renderer.toolName];
      return <WorkspaceCard {...props} />;
    }
    case "task":
      return <TaskToolCard {...props} />;
    case "webFetch":
      return <WebFetchToolCard {...props} />;
    case "generic":
      return <DefaultToolCard {...props} />;
  }
}

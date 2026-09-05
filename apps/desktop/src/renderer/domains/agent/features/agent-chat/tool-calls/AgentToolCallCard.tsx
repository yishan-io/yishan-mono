import { AgentToolCard } from "./AgentToolCard";
import { AskUserToolCard } from "./AskUserToolCard";
import { BashToolCard } from "./BashToolCard";
import { CodeGraphToolCard } from "./CodeGraphToolCard";
import { DefaultToolCard } from "./DefaultToolCard";
import { DiffToolCard } from "./DiffToolCard";
import { DshSubagentToolCard } from "./DshSubagentToolCard";
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
    case "codegraph_search":
    case "codegraph_callers":
    case "codegraph_callees":
    case "codegraph_impact":
    case "codegraph_explore":
    case "codegraph_node":
    case "codegraph_status":
    case "codegraph_files":
      return <CodeGraphToolCard {...props} />;
    case "Agent":
      return <AgentToolCard {...props} />;
    case "delegate_explore":
    case "delegate_builder":
      return props.runtime === "dsh" ? <DshSubagentToolCard {...props} /> : <DefaultToolCard {...props} />;
    case "memory_read":
      return <MemoryReadToolCard {...props} />;
    case "memory_search":
      return <MemorySearchToolCard {...props} />;
    case "memory_store":
      return <MemoryStoreToolCard {...props} />;
    case "ask_user":
      return <AskUserToolCard {...props} />;
    case "lsp_diagnostics":
    case "lsp_fix":
      return <LspToolCard {...props} />;
    case "workspace_list":
      return <WorkspaceListToolCard {...props} />;
    case "workspace_find":
      return <WorkspaceFindToolCard {...props} />;
    case "workspace_create":
      return <WorkspaceCreateToolCard {...props} />;
    case "workspace_close":
      return <WorkspaceCloseToolCard {...props} />;
    case "task_start":
    case "task_list":
    case "task_read":
    case "task_write":
    case "task_append_note":
    case "task_finish":
      return <TaskToolCard {...props} />;
    case "web_fetch":
      return <WebFetchToolCard {...props} />;
    default:
      return <DefaultToolCard {...props} />;
  }
}

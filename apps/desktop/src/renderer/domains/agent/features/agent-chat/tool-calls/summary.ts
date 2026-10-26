import type { ToolCardModel } from "../../../chat/transcript/presentation.types";

/** Target of one completed subagent open action. */
export type CompletedSubagentOpenTarget = {
  agentId?: string;
  childSessionId: string;
  title: string;
};

/** Shared props for one rendered agent tool-call card. */
export type AgentToolCallCardProps = ToolCardModel & {
  workspacePath?: string;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

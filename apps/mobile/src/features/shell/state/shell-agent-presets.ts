import type { AgentKind } from "@yishan/core";

export type MobileShellAgentPresetKind = Extract<AgentKind, "opencode" | "codex" | "claude">;

const AGENT_LAUNCH_COMMAND_BY_KIND: Record<MobileShellAgentPresetKind, string> = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
};

export function getShellAgentLaunchCommand(agentKind: MobileShellAgentPresetKind): string {
  return AGENT_LAUNCH_COMMAND_BY_KIND[agentKind];
}

export function buildShellTerminalLaunchCommand(launchCommand: string, shouldExec: boolean): string {
  const trimmedCommand = launchCommand.trim();
  if (!shouldExec || trimmedCommand.startsWith("exec ")) {
    return trimmedCommand;
  }

  return `exec ${trimmedCommand}`;
}

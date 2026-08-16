/**
 * TerminalCommands — the public command surface for the TerminalSession
 * feature.
 *
 * Phase 1 contract. Owned by `terminalCommands` today; moves to
 * `features/terminal/commands/` in Phase 6.
 */
import type * as terminalCommands from "../terminalCommands";

export type TerminalCommands = {
  consumeTerminalTabFocus: typeof terminalCommands.consumeTerminalTabFocus;
  retainOpenTerminalTabFocus: typeof terminalCommands.retainOpenTerminalTabFocus;
  createTerminalSession: typeof terminalCommands.createTerminalSession;
  writeTerminalInput: typeof terminalCommands.writeTerminalInput;
  resizeTerminal: typeof terminalCommands.resizeTerminal;
  readTerminalOutput: typeof terminalCommands.readTerminalOutput;
  closeTerminalSession: typeof terminalCommands.closeTerminalSession;
  killTerminalProcess: typeof terminalCommands.killTerminalProcess;
  listDetectedPorts: typeof terminalCommands.listDetectedPorts;
  setActiveWorkspace: typeof terminalCommands.setActiveWorkspace;
  getTerminalResourceUsage: typeof terminalCommands.getTerminalResourceUsage;
  listTerminalSessions: typeof terminalCommands.listTerminalSessions;
  subscribeTerminalOutput: typeof terminalCommands.subscribeTerminalOutput;
  subscribeTerminalSessions: typeof terminalCommands.subscribeTerminalSessions;
};

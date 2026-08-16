/**
 * First-wave command contracts (Phase 1).
 *
 * These types declare the public command surface per feature. The owning
 * command modules satisfy them today; `conformance.ts` enforces that at
 * typecheck time. They will move to `features/<feature>/commands/` as each
 * feature directory forms (Phases 4+).
 */
export type { WorkspaceCommands } from "../../features/workspace/commands/contract";
export type { ProjectCommands } from "../../features/project/commands/contract";
export type { SelectionCommands } from "../../features/workspace/commands/selectionContract";
export type { AgentCommands } from "../../features/agent/commands/contract";
export type { TerminalCommands } from "./terminal";
export type { WorkbenchCommands } from "../../features/workbench/commands/contract";
export * from "./conformance";

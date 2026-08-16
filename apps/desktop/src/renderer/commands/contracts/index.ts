/**
 * First-wave command contracts (Phase 1).
 *
 * These types declare the public command surface per feature. The owning
 * command modules satisfy them today; `conformance.ts` enforces that at
 * typecheck time. They will move to `features/<feature>/commands/` as each
 * feature directory forms (Phases 4+).
 */
export type { WorkspaceCommands } from "./workspace";
export type { ProjectCommands } from "./project";
export type { SelectionCommands } from "./selection";
export type { AgentCommands } from "./agent";
export type { TerminalCommands } from "./terminal";
export type { WorkbenchCommands } from "./workbench";
export * from "./conformance";

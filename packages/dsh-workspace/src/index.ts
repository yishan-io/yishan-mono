/** Daemon-authoritative workspace session context composition. */
export {
  WorkspaceBindingService,
  WorkspaceBindingHost,
  type WorkspaceBindingSetup,
  type WorkspaceBinding,
  type WorkspaceBindingPolicy,
  type WorkspaceBindingIdentity,
  type WorkspaceSessionBinding,
} from "./workspaceBinding";
/** DSH workspace lifecycle tool composition. */
export { apply, inject, name } from "./plugin";
export type {
  WorkspaceCloseInput,
  WorkspaceCloseResult,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
  WorkspaceFindInput,
  WorkspaceFindResult,
  WorkspaceListInput,
  WorkspaceListResult,
  WorkspaceRecord,
} from "@yishan-io/dsh-daemon-bridge";

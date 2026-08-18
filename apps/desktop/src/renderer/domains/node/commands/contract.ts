import type * as nodeCommands from "./nodeCommands";

/**
 * NodeCommands — the public command surface for the Node feature (Phase 12,
 * desktop5.md). Declared by the owning module; `contracts/conformance.ts`
 * enforces the contract at typecheck time.
 */
export type NodeCommands = {
  updateNodeScope: typeof nodeCommands.updateNodeScope;
  unregisterNode: typeof nodeCommands.unregisterNode;
  listOrgNodes: typeof nodeCommands.listOrgNodes;
};

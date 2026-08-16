/**
 * SelectionCommands — the public command surface for selection state
 * (selected project + selected workspace identifiers).
 *
 * Phase 1 contract. Owned by `selectionCommands` today; moves to
 * `features/workspace/commands/` (selection owner) in Phases 3–4.
 */
import type * as selectionCommands from "./selectionCommands";

export type SelectionCommands = {
  setSelectedRepo: typeof selectionCommands.setSelectedRepo;
  setSelectedWorkspace: typeof selectionCommands.setSelectedWorkspace;
};

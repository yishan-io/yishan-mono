import { useMemo } from "react";
import { type Commands, createCommands } from "../commands/composition";

export type { Commands } from "../commands/composition";

/**
 * Returns the UI-facing command surface, wired to command modules and pure
 * store actions. The wiring itself lives in `commands/composition.ts`
 * (`createCommands`) so command dependencies are explicit and React-free.
 */
export function useCommands(): Commands {
  return useMemo(() => createCommands(), []);
}

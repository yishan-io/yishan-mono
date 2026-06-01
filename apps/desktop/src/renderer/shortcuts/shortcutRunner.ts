import type { ShortContext, ShortcutDefinition } from "./types";

type ParsedShortcutCombo = {
  key: string;
  ctrl: boolean;
  command: boolean;
  shift: boolean;
  alt: boolean;
};

type CompiledShortcutDefinition = {
  definition: ShortcutDefinition;
  combos: ParsedShortcutCombo[];
};

/** Normalizes one shortcut key token so runtime key matching stays stable. */
function normalizeShortcutKeyToken(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (normalized === "escape") {
    return "esc";
  }

  if (normalized === "arrowup") {
    return "up";
  }

  if (normalized === "arrowdown") {
    return "down";
  }

  if (normalized === "arrowleft") {
    return "left";
  }

  if (normalized === "arrowright") {
    return "right";
  }

  return normalized;
}

/** Parses one shortcut combo string into modifiers and terminal key token. */
function parseKeyCombo(combo: string): ParsedShortcutCombo | null {
  const tokens = combo
    .split("+")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  const key = normalizeShortcutKeyToken(tokens[tokens.length - 1] ?? "");
  if (!key) {
    return null;
  }

  const modifiers = tokens.slice(0, -1);
  return {
    key,
    ctrl: modifiers.includes("ctrl"),
    command: modifiers.includes("command"),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt"),
  };
}

/**
 * Returns true when one parsed combo is valid for the given platform.
 * On macOS, ctrl-only combos are excluded (they are Windows/Linux bindings).
 * On Windows/Linux, command combos are excluded (they are macOS bindings).
 */
function isPlatformCombo(combo: ParsedShortcutCombo, isMac: boolean): boolean {
  if (isMac) {
    return !combo.ctrl || combo.command;
  }

  return !combo.command;
}

/** Compiles shortcut definitions into parsed combos for low-cost keydown matching. */
export function compileShortcutDefinitions(
  definitions: readonly ShortcutDefinition[],
  isMac = false,
): CompiledShortcutDefinition[] {
  return definitions.map((definition) => ({
    definition,
    combos: definition.keys
      .split(",")
      .map((combo) => combo.trim())
      .filter((combo) => combo.length > 0)
      .map(parseKeyCombo)
      .filter((combo): combo is ParsedShortcutCombo => Boolean(combo))
      .filter((combo) => isPlatformCombo(combo, isMac)),
  }));
}

/**
 * Returns true when the current context satisfies the scope precondition for one shortcut.
 * Scope preconditions are checked before shouldRun so individual shortcuts don't
 * need to repeat the same baseline route/popup guards.
 *
 * - "global"    — no precondition; fires on any route
 * - "workspace" — requires isWorkspaceRoute and no popup open
 */
function matchesScope(definition: ShortcutDefinition, context: ShortContext): boolean {
  if (definition.scope === "workspace") {
    return context.isWorkspaceRoute && !context.isPopupOpen;
  }

  return true;
}

/** Returns true when one keyboard event matches one parsed key binding combo. */
function matchKeyBinding(event: KeyboardEvent, combo: ParsedShortcutCombo): boolean {
  const normalizedEventKey = normalizeShortcutKeyToken(event.key);
  const keyMatches =
    combo.key === normalizedEventKey ||
    ((combo.key === "backspace" || combo.key === "delete") &&
      (normalizedEventKey === "backspace" || normalizedEventKey === "delete"));
  if (!keyMatches) {
    return false;
  }

  return (
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.command &&
    event.shiftKey === combo.shift &&
    event.altKey === combo.alt
  );
}

/** Executes the first matching shortcut definition for one keyboard event. */
export function processShortcuts(
  compiledDefinitions: readonly CompiledShortcutDefinition[],
  context: ShortContext,
  event: KeyboardEvent,
): void {
  for (const compiledDefinition of compiledDefinitions) {
    if (!compiledDefinition.combos.some((combo) => matchKeyBinding(event, combo))) {
      continue;
    }

    if (!matchesScope(compiledDefinition.definition, context)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    compiledDefinition.definition.run(context, event);
    return;
  }
}

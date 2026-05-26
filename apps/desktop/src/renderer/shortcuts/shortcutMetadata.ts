import type { ShortcutCatalogItem, SupportedKeyBinding } from "./types";

/** Converts one hotkeys-js token to a UI-facing key label. */
function toDisplayKeyToken(token: string, platform: "mac" | "windows"): string {
  if (token === "command") {
    return "⌘";
  }
  if (token === "ctrl") {
    return "CTRL";
  }
  if (token === "shift") {
    return "⇧";
  }
  if (token === "alt") {
    return platform === "mac" ? "⌥" : "ALT";
  }
  if (token === "delete" || token === "backspace") {
    return "DELETE/BACKSPACE";
  }

  return token.toUpperCase();
}

/** Parses one hotkeys-js combo into modifiers and a terminal key token. */
function parseHotkeyCombo(combo: string): { modifiers: readonly string[]; key: string } {
  const normalizedTokens = combo
    .split("+")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  if (normalizedTokens.length === 0) {
    return {
      modifiers: [],
      key: "",
    };
  }

  const key = normalizedTokens[normalizedTokens.length - 1] ?? "";
  const modifiers = normalizedTokens.slice(0, -1);
  return {
    modifiers,
    key,
  };
}

/**
 * Builds one display key sequence from platform-specific combo list.
 * Supports compact ranges for 1-9 and Delete/Backspace variants.
 */
function buildDisplayKeysForPlatformCombos(combos: readonly string[], platform: "mac" | "windows"): readonly string[] {
  const parsedCombos = combos.map(parseHotkeyCombo).filter((combo) => combo.key.length > 0);
  if (parsedCombos.length === 0) {
    return [];
  }

  const firstCombo = parsedCombos[0];
  if (!firstCombo) {
    return [];
  }
  const serializedModifiers = JSON.stringify(firstCombo.modifiers);
  const hasSameModifiers = parsedCombos.every((combo) => JSON.stringify(combo.modifiers) === serializedModifiers);
  const keySet = new Set(parsedCombos.map((combo) => combo.key));

  if (hasSameModifiers && keySet.has("delete") && keySet.has("backspace") && keySet.size === 2) {
    return [...firstCombo.modifiers.map((t) => toDisplayKeyToken(t, platform)), "DELETE/BACKSPACE"];
  }

  const numericKeys = parsedCombos.map((combo) => Number.parseInt(combo.key, 10));
  const hasNumericRange =
    hasSameModifiers &&
    numericKeys.length === 9 &&
    numericKeys.every((value, index) => value === index + 1) &&
    keySet.size === 9;
  if (hasNumericRange) {
    return [...firstCombo.modifiers.map((t) => toDisplayKeyToken(t, platform)), "1-9"];
  }

  return [...firstCombo.modifiers.map((t) => toDisplayKeyToken(t, platform)), toDisplayKeyToken(firstCombo.key, platform)];
}

/** Derives per-platform display keys from one hotkeys-js key string. */
function derivePlatformDisplayKeys(keys: string): {
  macKeys: readonly string[];
  windowsKeys: readonly string[];
} {
  const combos = keys
    .split(",")
    .map((combo) => combo.trim())
    .filter((combo) => combo.length > 0);

  const macCombos = combos.filter((combo) => combo.includes("command+"));
  const windowsCombos = combos.filter((combo) => combo.includes("ctrl+"));
  const sharedCombos = combos.filter((combo) => !combo.includes("command+") && !combo.includes("ctrl+"));

  const resolvedMacCombos = macCombos.length > 0 ? macCombos : sharedCombos;
  const resolvedWindowsCombos = windowsCombos.length > 0 ? windowsCombos : sharedCombos;

  return {
    macKeys: buildDisplayKeysForPlatformCombos(resolvedMacCombos, "mac"),
    windowsKeys: buildDisplayKeysForPlatformCombos(resolvedWindowsCombos, "windows"),
  };
}

/** Builds keyboard shortcut display metadata from one shortcut catalog entry. */
export function toSupportedKeyBinding(binding: ShortcutCatalogItem): SupportedKeyBinding {
  return {
    id: binding.id,
    descriptionKey: binding.descriptionKey,
    scope: binding.scope,
    ...derivePlatformDisplayKeys(binding.keys),
  };
}

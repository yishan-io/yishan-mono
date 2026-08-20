import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Converts one React keyboard event into a normalized combo string (e.g. "ctrl+shift+p"). */
export function toComboFromKeyboardEvent(event: ReactKeyboardEvent<HTMLElement>): string | undefined {
  const code = event.code;
  let rawKeyFromCode: string | undefined;
  if (code.startsWith("Key") && code.length === 4) {
    rawKeyFromCode = code.slice(3).toLowerCase();
  } else if (code.startsWith("Digit") && code.length === 6) {
    rawKeyFromCode = code.slice(5);
  } else if (code === "Slash") {
    rawKeyFromCode = "/";
  } else if (code === "Backslash") {
    rawKeyFromCode = "\\";
  } else if (code === "Backspace") {
    rawKeyFromCode = "backspace";
  } else if (code === "Delete") {
    rawKeyFromCode = "delete";
  } else if (code === "Escape") {
    rawKeyFromCode = "esc";
  }

  const rawKey = (rawKeyFromCode ?? event.key).toLowerCase();
  if (["control", "meta", "shift", "alt"].includes(rawKey)) {
    return undefined;
  }

  const key = rawKey === "escape" ? "esc" : rawKey;
  const modifiers: string[] = [];
  if (event.ctrlKey) {
    modifiers.push("ctrl");
  }
  if (event.metaKey) {
    modifiers.push("command");
  }
  if (event.shiftKey) {
    modifiers.push("shift");
  }
  if (event.altKey) {
    modifiers.push("alt");
  }

  return [...modifiers, key].join("+");
}

/** Converts one native window keydown event into a normalized combo string. */
export function toComboFromNativeKeyboardEvent(event: KeyboardEvent): string | undefined {
  const rawKey = event.key;
  const syntheticEvent = {
    code: event.code,
    key: rawKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  } as ReactKeyboardEvent<HTMLElement>;

  return toComboFromKeyboardEvent(syntheticEvent);
}

/** Renders one combo token as its display glyph (⌘, CTRL, ⇧, ALT, ESC, …). */
export function toDisplayKeyToken(token: string): string {
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
    return "ALT";
  }
  if (token === "esc") {
    return "ESC";
  }
  if (token === "backspace" || token === "delete") {
    return "DELETE/BACKSPACE";
  }

  return token.toUpperCase();
}

/** Maps one normalized combo string to its display token list. */
export function toDisplayKeysForCombo(combo: string): readonly string[] {
  const tokens = combo
    .split("+")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return [];
  }

  return tokens.map(toDisplayKeyToken);
}

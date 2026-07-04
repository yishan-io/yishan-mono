/**
 * Computes keyboard-aware spacing for the emulator accessory cluster so the
 * bottom controls consume real layout space instead of floating over the
 * terminal viewport.
 */
export function getTerminalAccessoryBottomInset(keyboardBottomInset: number) {
  return Math.max(0, keyboardBottomInset);
}

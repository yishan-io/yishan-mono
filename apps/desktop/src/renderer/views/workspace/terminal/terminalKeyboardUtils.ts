/** Returns true when xterm should skip handling so renderer Cmd+W can close one terminal tab. */
export function shouldReleaseCommandWForTabCloseShortcut(event: KeyboardEvent): boolean {
  return (
    isMacPlatform() &&
    event.type === "keydown" &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "w"
  );
}

/** Returns true when xterm should skip handling so the renderer workspace navigation shortcut runs. */
export function shouldReleaseWorkspaceNavigationShortcut(event: KeyboardEvent): boolean {
  return (
    event.type === "keydown" &&
    event.ctrlKey &&
    event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "j" || event.key === "k")
  );
}

/** Returns true when macOS Cmd+K should clear local terminal output instead of reaching the shell. */
export function shouldClearTerminalOutputShortcut(event: KeyboardEvent): boolean {
  return (
    isMacPlatform() &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

/** Returns true when one keyboard event is an unmodified Shift+Enter line-feed chord. */
export function isShiftEnterLineFeedChord(event: KeyboardEvent): boolean {
  return event.key === "Enter" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

/** Returns true when the current renderer runs on one macOS platform. */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgentDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform;
  const platformHint = (userAgentDataPlatform ?? navigator.userAgent).toLowerCase();
  return platformHint.includes("mac");
}

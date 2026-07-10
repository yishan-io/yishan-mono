/**
 * Public entry point for the shell feature.
 * Route files and external integrations should import the shell screen and shared shell types from here.
 */
export { ShellScreen } from "./screens/ShellScreen";
export type { ShellFocusPreview, ShellSelection, ShellPaneTab, TerminalItem } from "./state/shell.types";

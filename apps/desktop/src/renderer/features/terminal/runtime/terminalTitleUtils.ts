import type { WorkspaceTab } from "../../../store/types";
import { workspaceStore } from "../../../store/workspaceStore";

const MAX_TERMINAL_COMMAND_TITLE_LENGTH = 32;
const ASCII_ESCAPE_CODE = 27;

/** Resolves one terminal tab's workspace root for the default terminal title. */
export function resolveTerminalWorkspacePath(
  tab: Extract<WorkspaceTab, { kind: "terminal" }> | undefined,
): string | undefined {
  if (!tab) {
    return undefined;
  }

  return workspaceStore.getState().workspaces.find((workspace) => workspace.id === tab.workspaceId)?.worktreePath;
}

/** Builds one concise tab title from a current working directory. */
export function formatTerminalPathTitle(path: string | undefined): string {
  const normalizedPath = normalizeTerminalCommandForTitle(path ?? "");
  if (!normalizedPath) {
    return "";
  }

  const pathCandidate = normalizedPath.includes(":")
    ? normalizedPath.slice(normalizedPath.lastIndexOf(":") + 1)
    : normalizedPath;
  const pathParts = pathCandidate.replace(/\\/g, "/").split("/").filter(Boolean);
  const directoryName = pathParts.at(-1) ?? pathCandidate.trim();
  return formatTerminalCommandTitle(directoryName || pathCandidate.trim());
}

/** Builds one concise terminal tab title from a submitted shell command. */
export function formatTerminalCommandTitle(command: string): string {
  const normalizedCommand = normalizeTerminalCommandForTitle(command);
  if (!normalizedCommand) {
    return "";
  }

  if (normalizedCommand.length <= MAX_TERMINAL_COMMAND_TITLE_LENGTH) {
    return normalizedCommand;
  }

  return `${normalizedCommand.slice(0, MAX_TERMINAL_COMMAND_TITLE_LENGTH - 1)}…`;
}

/** Normalizes pasted or launch commands into one single-line label candidate. */
function normalizeTerminalCommandForTitle(command: string): string {
  return stripTerminalControlSequences(command).replace(/\s+/g, " ").trim();
}

/** Removes all non-printable control characters from one candidate tab title. */
function stripTerminalControlSequences(value: string): string {
  let output = "";

  for (const character of stripTerminalEscapeSequences(value)) {
    const code = character.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      output += character;
    }
  }

  return output;
}

/** Removes terminal control escape sequences that are not part of shell command text. */
function stripTerminalEscapeSequences(data: string): string {
  let output = "";

  for (let index = 0; index < data.length; index += 1) {
    const character = data[index];
    if (character?.charCodeAt(0) !== ASCII_ESCAPE_CODE) {
      output += character ?? "";
      continue;
    }

    if (data[index + 1] !== "[") {
      continue;
    }

    index += 1;
    while (index + 1 < data.length) {
      index += 1;
      const code = data.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        break;
      }
    }
  }

  return output;
}

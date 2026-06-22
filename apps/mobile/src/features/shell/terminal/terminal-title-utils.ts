const MAX_TERMINAL_COMMAND_TITLE_LENGTH = 32;
const ASCII_ESCAPE_CODE = 27;

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

function normalizeTerminalCommandForTitle(command: string): string {
  return stripTerminalControlSequences(command).replace(/\s+/g, " ").trim();
}

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

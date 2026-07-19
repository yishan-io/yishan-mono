import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import type { AgentRecord } from "../agents/types";
import type { AgentManager } from "../runtime/agentManager";
import { getRecentActivityLines, truncateSingleLine } from "./agentActivity";

interface AgentOverlayTheme {
  fg(color: string, text: string): string;
}

const REFRESH_INTERVAL_MS = 250;
const MAX_PROMPT_PREVIEW_LENGTH = 200;

/**
 * Floating live viewer for one selected sub-agent session.
 */
export class AgentLiveOverlay {
  private readonly tui: TUI;
  private readonly theme: AgentOverlayTheme;
  private readonly getRecord: () => AgentRecord | undefined;
  private readonly done: (result: undefined) => void;
  private readonly refreshInterval: ReturnType<typeof setInterval>;

  constructor(
    tui: TUI,
    theme: AgentOverlayTheme,
    getRecord: () => AgentRecord | undefined,
    done: (result: undefined) => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.getRecord = getRecord;
    this.done = done;
    this.refreshInterval = setInterval(() => {
      this.tui.requestRender();
    }, REFRESH_INTERVAL_MS);
  }

  render(width: number): string[] {
    const record = this.getRecord();
    const contentWidth = Math.max(20, width - 4);
    const lines: string[] = [];

    if (!record) {
      lines.push(this.theme.fg("error", "Sub-agent record is no longer available."));
      lines.push(this.theme.fg("muted", "Esc to close"));
      return this.box(lines, width, "Live sub-agent");
    }

    lines.push(
      `${record.agentName} · ${record.status} · ${record.mode} · ${record.id}`,
      "",
      this.theme.fg("accent", "Prompt"),
      ...wrapPlainText(truncateSingleLine(record.prompt, MAX_PROMPT_PREVIEW_LENGTH), contentWidth),
      "",
      this.theme.fg("accent", "Recent transcript"),
      ...getRecentActivityLines(record.session?.messages ?? [], record.responseText, record.error).flatMap((line) =>
        wrapPlainText(line, contentWidth),
      ),
      "",
      this.theme.fg("muted", "Esc to close"),
    );

    return this.box(lines, width, "Live sub-agent");
  }

  handleInput(data: string): void {
    if (data === "\u001b") {
      this.done(undefined);
    }
  }

  invalidate(): void {}

  dispose(): void {
    clearInterval(this.refreshInterval);
  }

  private box(lines: string[], width: number, title: string): string[] {
    const innerWidth = Math.max(1, width - 2);
    const titleText = truncateToWidth(` ${title} `, innerWidth);
    const titleWidth = visibleWidth(titleText);
    const leftBorder = "─".repeat(Math.floor((innerWidth - titleWidth) / 2));
    const rightBorder = "─".repeat(Math.max(0, innerWidth - titleWidth - leftBorder.length));
    const output = [
      this.theme.fg("border", `╭${leftBorder}`) +
        this.theme.fg("accent", titleText) +
        this.theme.fg("border", `${rightBorder}╮`),
    ];

    for (const line of lines) {
      const body = truncateToWidth(line, innerWidth, "...", true);
      const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(body)));
      output.push(this.theme.fg("border", "│") + body + padding + this.theme.fg("border", "│"));
    }

    output.push(this.theme.fg("border", `╰${"─".repeat(innerWidth)}╯`));
    return output;
  }
}

/**
 * Opens a live overlay for one agent record.
 */
export async function openAgentLiveOverlay(
  record: AgentRecord,
  manager: Pick<AgentManager, "get">,
  ui: Pick<ExtensionUIContext, "custom" | "notify">,
): Promise<void> {
  await ui.custom((tui, theme, _kb, done) => new AgentLiveOverlay(tui, theme, () => manager.get(record.id), done), {
    overlay: true,
    overlayOptions: {
      anchor: "right-center",
      width: "42%",
      minWidth: 50,
      maxHeight: "85%",
      margin: { right: 1 },
    },
  });
}

function wrapPlainText(text: string, width: number): string[] {
  if (text.length <= width) {
    return [text];
  }

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (nextLine.length <= width) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    currentLine = word;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

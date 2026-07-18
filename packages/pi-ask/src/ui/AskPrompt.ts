import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Editor, Key, Spacer, Text, matchesKey } from "@earendil-works/pi-tui";
import type { Component, EditorTheme, KeybindingsManager, TUI } from "@earendil-works/pi-tui";

import type { AskOption, AskResponse } from "../types";

interface AskPromptOptions {
  question: string;
  context?: string;
  options: AskOption[];
  allowMultiple: boolean;
  allowFreeform: boolean;
  tui: TUI;
  theme: Theme;
  keybindings: KeybindingsManager;
  onDone: (result: AskResponse | null) => void;
}

type AskPromptMode = "select" | "freeform";

function createEditorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (text: string) => theme.fg("accent", text),
    selectList: {
      selectedPrefix: (text: string) => theme.fg("accent", text),
      selectedText: (text: string) => theme.fg("accent", text),
      description: (text: string) => theme.fg("muted", text),
      scrollInfo: (text: string) => theme.fg("dim", text),
      noMatch: (text: string) => theme.fg("warning", text),
    },
  };
}

class SingleSelectList implements Component {
  private selectedIndex = 0;

  public onSubmit?: (selection: string) => void;
  public onCancel?: () => void;

  public constructor(
    private readonly options: AskOption[],
    private readonly allowFreeform: boolean,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
  ) {}

  invalidate(): void {}

  handleInput(data: string): void {
    const itemCount = this.options.length + (this.allowFreeform ? 1 : 0);
    if (this.keybindings.matches(data, "tui.select.cancel")) {
      this.onCancel?.();
      return;
    }

    if (itemCount === 0) {
      this.onCancel?.();
      return;
    }

    if (this.keybindings.matches(data, "tui.select.up")) {
      this.selectedIndex = this.selectedIndex === 0 ? itemCount - 1 : this.selectedIndex - 1;
      return;
    }

    if (this.keybindings.matches(data, "tui.select.down")) {
      this.selectedIndex = this.selectedIndex === itemCount - 1 ? 0 : this.selectedIndex + 1;
      return;
    }

    if (this.keybindings.matches(data, "tui.select.confirm")) {
      if (this.allowFreeform && this.selectedIndex === this.options.length) {
        this.onSubmit?.("__freeform__");
        return;
      }

      const selection = this.options[this.selectedIndex]?.title;
      if (!selection) {
        this.onCancel?.();
        return;
      }
      this.onSubmit?.(selection);
    }
  }

  render(width: number): string[] {
    const lines = this.options.map((option, index) => {
      const prefix = index === this.selectedIndex ? this.theme.fg("accent", "→") : " ";
      const suffix = option.description ? ` — ${option.description}` : "";
      return `${prefix} ${option.title}${suffix}`.slice(0, width);
    });

    if (this.allowFreeform) {
      const prefix = this.selectedIndex === this.options.length ? this.theme.fg("accent", "→") : " ";
      lines.push(`${prefix} ✎ Type custom response`.slice(0, width));
    }

    return lines;
  }
}

class MultiSelectList implements Component {
  private selectedIndex = 0;
  private checked = new Set<number>();

  public onSubmit?: (selections: string[]) => void;
  public onCancel?: () => void;
  public onEnterFreeform?: () => void;

  public constructor(
    private readonly options: AskOption[],
    private readonly allowFreeform: boolean,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
  ) {}

  invalidate(): void {}

  private getItemCount(): number {
    return this.options.length + (this.allowFreeform ? 1 : 0);
  }

  private isFreeformRow(index: number): boolean {
    return this.allowFreeform && index === this.options.length;
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.cancel")) {
      this.onCancel?.();
      return;
    }

    const itemCount = this.getItemCount();
    if (itemCount === 0) {
      this.onCancel?.();
      return;
    }

    if (this.keybindings.matches(data, "tui.select.up")) {
      this.selectedIndex = this.selectedIndex === 0 ? itemCount - 1 : this.selectedIndex - 1;
      return;
    }

    if (this.keybindings.matches(data, "tui.select.down")) {
      this.selectedIndex = this.selectedIndex === itemCount - 1 ? 0 : this.selectedIndex + 1;
      return;
    }

    if (matchesKey(data, Key.space)) {
      if (this.isFreeformRow(this.selectedIndex)) {
        this.onEnterFreeform?.();
        return;
      }

      if (this.checked.has(this.selectedIndex)) {
        this.checked.delete(this.selectedIndex);
      } else {
        this.checked.add(this.selectedIndex);
      }
      return;
    }

    if (this.keybindings.matches(data, "tui.select.confirm")) {
      if (this.isFreeformRow(this.selectedIndex)) {
        this.onEnterFreeform?.();
        return;
      }

      const selectedTitles = Array.from(this.checked)
        .sort((leftIndex, rightIndex) => leftIndex - rightIndex)
        .map((index) => this.options[index]?.title)
        .filter((title): title is string => Boolean(title));
      const fallbackTitle = this.options[this.selectedIndex]?.title;
      const selections = selectedTitles.length > 0 ? selectedTitles : fallbackTitle ? [fallbackTitle] : [];
      if (selections.length === 0) {
        this.onCancel?.();
        return;
      }
      this.onSubmit?.(selections);
    }
  }

  render(width: number): string[] {
    const lines = this.options.map((option, index) => {
      const prefix = index === this.selectedIndex ? this.theme.fg("accent", "→") : " ";
      const checkbox = this.checked.has(index) ? "[x]" : "[ ]";
      const suffix = option.description ? ` — ${option.description}` : "";
      return `${prefix} ${checkbox} ${option.title}${suffix}`.slice(0, width);
    });

    if (this.allowFreeform) {
      const prefix = this.options.length === this.selectedIndex ? this.theme.fg("accent", "→") : " ";
      lines.push(`${prefix} ✎ Type custom response`.slice(0, width));
    }

    return lines;
  }
}

/**
 * Interactive ask_user prompt for single-select, multi-select, and freeform flows.
 */
export class AskPrompt extends Container {
  private readonly body: Container;
  private readonly helpText: Text;
  private readonly singleSelect?: SingleSelectList;
  private readonly multiSelect?: MultiSelectList;
  private readonly editor?: Editor;
  private mode: AskPromptMode = "select";

  public constructor(private readonly options: AskPromptOptions) {
    super();

    this.body = new Container();
    this.helpText = new Text("", 1, 0);

    this.addChild(new Text(options.theme.fg("accent", options.theme.bold("ask_user")), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new Text(options.theme.bold(options.question), 1, 0));
    if (options.context) {
      this.addChild(new Spacer(1));
      this.addChild(new Text(options.theme.fg("muted", options.context), 1, 0));
    }
    this.addChild(new Spacer(1));
    this.addChild(this.body);
    this.addChild(new Spacer(1));
    this.addChild(this.helpText);

    if (options.allowMultiple) {
      this.multiSelect = new MultiSelectList(
        options.options,
        options.allowFreeform,
        options.theme,
        options.keybindings,
      );
      this.multiSelect.onSubmit = (selections) => {
        options.onDone({ kind: "selection", selections });
      };
      this.multiSelect.onCancel = () => {
        options.onDone(null);
      };
      this.multiSelect.onEnterFreeform = () => {
        this.showFreeform();
      };
    } else {
      this.singleSelect = new SingleSelectList(
        options.options,
        options.allowFreeform,
        options.theme,
        options.keybindings,
      );
      this.singleSelect.onSubmit = (selection) => {
        if (selection === "__freeform__") {
          this.showFreeform();
          return;
        }
        options.onDone({ kind: "selection", selections: [selection] });
      };
      this.singleSelect.onCancel = () => {
        options.onDone(null);
      };
    }

    if (options.allowFreeform) {
      this.editor = new Editor(options.tui, createEditorTheme(options.theme));
      this.editor.disableSubmit = false;
      this.editor.onSubmit = (text) => {
        const trimmedText = text.trim();
        options.onDone(trimmedText ? { kind: "freeform", text: trimmedText } : null);
      };
    }

    this.showSelect();
  }

  private showSelect(): void {
    this.mode = "select";
    this.body.clear();
    const component = this.options.allowMultiple ? this.multiSelect : this.singleSelect;
    if (component) {
      this.body.addChild(component);
    }
    this.helpText.setText(
      this.options.allowMultiple ? "Space toggle • Enter confirm • Esc cancel" : "Enter confirm • Esc cancel",
    );
  }

  private showFreeform(): void {
    if (!this.editor) {
      this.options.onDone(null);
      return;
    }

    this.mode = "freeform";
    this.body.clear();
    this.body.addChild(this.editor);
    this.helpText.setText("Enter submit • Esc cancel");
  }

  handleInput(data: string): void {
    if (this.mode === "freeform") {
      if (matchesKey(data, Key.escape)) {
        this.options.onDone(null);
        return;
      }
      this.editor?.handleInput(data);
      return;
    }

    if (this.options.allowMultiple) {
      this.multiSelect?.handleInput(data);
      return;
    }

    this.singleSelect?.handleInput(data);
  }
}

import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-tui", () => {
  class MockContainer {
    private children: Array<{ render?: (width: number) => string[] }> = [];
    addChild(child?: { render?: (width: number) => string[] }) {
      if (child) {
        this.children.push(child);
      }
    }
    clear() {
      this.children = [];
    }
    render(width = 80) {
      return this.children.flatMap((child) => child.render?.(width) ?? []);
    }
    handleInput(_data: string) {}
  }

  class MockText {
    public constructor(private text: string) {}
    setText(text: string) {
      this.text = text;
    }
    render() {
      return [this.text];
    }
  }

  class MockSpacer {
    render() {
      return [""];
    }
  }

  class MockEditor {
    public disableSubmit = false;
    public onSubmit?: (text: string) => void;
    private text = "";
    handleInput(data: string) {
      if (data === "enter") {
        this.onSubmit?.(this.text);
        return;
      }
      if (data.length === 1) {
        this.text += data;
      }
    }
    render() {
      return [this.text];
    }
  }

  class MockSelectList {
    public onSubmit?: (value: string) => void;
    public onCancel?: () => void;
    private selectedIndex = 0;
    public constructor(
      private readonly options: Array<{ value: string; label: string }>,
      _theme: unknown,
      private readonly keybindings: { matches: (data: string, keybinding: string) => boolean },
    ) {}
    handleInput(data: string) {
      if (this.keybindings.matches(data, "tui.select.cancel")) {
        this.onCancel?.();
        return;
      }
      if (this.keybindings.matches(data, "tui.select.down")) {
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.options.length - 1);
        return;
      }
      if (this.keybindings.matches(data, "tui.select.confirm")) {
        this.onSubmit?.(this.options[this.selectedIndex]?.value ?? "");
      }
    }
    render() {
      return this.options.map((option) => option.label);
    }
  }

  return {
    Container: MockContainer,
    Editor: MockEditor,
    Key: { escape: "escape", space: "space" },
    SelectList: MockSelectList,
    Spacer: MockSpacer,
    Text: MockText,
    matchesKey: (data: string, key: string) => data === key,
  };
});

import { AskPrompt } from "./AskPrompt";

function createTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function createKeybindings() {
  return {
    matches(data: string, keybinding: string) {
      const bindings: Record<string, string[]> = {
        "tui.select.confirm": ["enter"],
        "tui.select.cancel": ["escape"],
        "tui.select.up": ["up"],
        "tui.select.down": ["down"],
      };
      return (bindings[keybinding] ?? []).includes(data);
    },
  };
}

describe("AskPrompt", () => {
  it("submits a single-select answer", () => {
    let result: unknown;
    const prompt = new AskPrompt({
      question: "Which option?",
      options: [{ title: "A" }, { title: "B" }],
      allowMultiple: false,
      allowFreeform: false,
      tui: {} as never,
      theme: createTheme() as never,
      keybindings: createKeybindings() as never,
      onDone: (value) => {
        result = value;
      },
    });

    prompt.handleInput("down");
    prompt.handleInput("enter");

    expect(result).toEqual({ kind: "selection", selections: ["B"] });
  });

  it("submits a freeform answer", () => {
    let result: unknown;
    const prompt = new AskPrompt({
      question: "Which option?",
      options: [{ title: "A" }],
      allowMultiple: false,
      allowFreeform: true,
      tui: {} as never,
      theme: createTheme() as never,
      keybindings: createKeybindings() as never,
      onDone: (value) => {
        result = value;
      },
    });

    prompt.handleInput("down");
    prompt.handleInput("enter");
    prompt.handleInput("x");
    prompt.handleInput("enter");

    expect(result).toEqual({ kind: "freeform", text: "x" });
  });

  it("cancels on escape", () => {
    let result: unknown = "pending";
    const prompt = new AskPrompt({
      question: "Which option?",
      options: [{ title: "A" }],
      allowMultiple: false,
      allowFreeform: false,
      tui: {} as never,
      theme: createTheme() as never,
      keybindings: createKeybindings() as never,
      onDone: (value) => {
        result = value;
      },
    });

    prompt.handleInput("escape");

    expect(result).toBeNull();
  });
});

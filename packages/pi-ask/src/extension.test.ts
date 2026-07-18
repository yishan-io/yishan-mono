import { describe, expect, it, vi } from "vitest";

import {
  ASK_USER_ANSWERED_EVENT,
  ASK_USER_CANCELLED_EVENT,
  ASK_USER_STARTED_EVENT,
  createPiAskExtension,
} from "./index";

type RegisteredTool = {
  name: string;
  executionMode?: string;
  prepareArguments?: (args: unknown) => unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
  renderResult: (...args: unknown[]) => unknown;
};

function setupTool(): { tool: RegisteredTool; emit: ReturnType<typeof vi.fn> } {
  const tools: RegisteredTool[] = [];
  const emit = vi.fn();
  createPiAskExtension({
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    events: {
      emit,
    },
  } as never);

  const tool = tools.find((entry) => entry.name === "ask_user");
  if (!tool) {
    throw new Error("Expected ask_user tool");
  }
  return { tool, emit };
}

describe("createPiAskExtension", () => {
  it("registers ask_user as a sequential tool", () => {
    const { tool } = setupTool();
    expect(tool.executionMode).toBe("sequential");
  });

  it("normalizes arguments before execution", () => {
    const { tool } = setupTool();
    expect(
      tool.prepareArguments?.({
        question: "Which option?",
        options: [{ label: "A" }],
      }),
    ).toEqual({
      question: "Which option?",
      options: [{ label: "A" }],
    });
  });

  it("returns a structured unavailable result in non-interactive mode", async () => {
    const { tool, emit } = setupTool();
    const result = (await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        options: ["A", "B"],
      },
      undefined,
      undefined,
      {
        mode: "json",
        hasUI: false,
      },
    )) as { details: { unavailableReason?: string; cancelled: boolean } };

    expect(result.details.unavailableReason).toBe("non_interactive_mode");
    expect(result.details.cancelled).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it("uses rpc select flow for single-select answers", async () => {
    const { tool, emit } = setupTool();
    const result = (await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        options: ["A", "B"],
      },
      undefined,
      undefined,
      {
        mode: "rpc",
        hasUI: true,
        ui: {
          select: async () => "B",
        },
      },
    )) as { details: { response: unknown; cancelled: boolean } };

    expect(result.details.response).toEqual({ kind: "selection", selections: ["B"] });
    expect(result.details.cancelled).toBe(false);
    expect(emit).toHaveBeenNthCalledWith(1, ASK_USER_STARTED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
    expect(emit).toHaveBeenNthCalledWith(2, ASK_USER_ANSWERED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
  });

  it("uses rpc input flow for freeform answers", async () => {
    const { tool } = setupTool();
    const result = (await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        options: ["A"],
        allowFreeform: true,
      },
      undefined,
      undefined,
      {
        mode: "rpc",
        hasUI: true,
        ui: {
          select: async () => "__ask_user_freeform__",
          input: async () => "custom answer",
        },
      },
    )) as { details: { response: unknown } };

    expect(result.details.response).toEqual({ kind: "freeform", text: "custom answer" });
  });

  it("uses rpc input flow for multi-select answers", async () => {
    const { tool } = setupTool();
    const result = (await tool.execute(
      "tool-1",
      {
        question: "Which options?",
        options: ["A", "B", "C"],
        allowMultiple: true,
      },
      undefined,
      undefined,
      {
        mode: "rpc",
        hasUI: true,
        ui: {
          input: async () => "A, C",
        },
      },
    )) as { details: { response: unknown } };

    expect(result.details.response).toEqual({ kind: "selection", selections: ["A", "C"] });
  });

  it("maps numeric rpc multi-select input back to canonical option titles", async () => {
    const { tool } = setupTool();
    const result = (await tool.execute(
      "tool-1",
      {
        question: "Which options?",
        options: ["A", "B", "C"],
        allowMultiple: true,
      },
      undefined,
      undefined,
      {
        mode: "rpc",
        hasUI: true,
        ui: {
          input: async () => "1, 3",
        },
      },
    )) as { details: { response: unknown } };

    expect(result.details.response).toEqual({ kind: "selection", selections: ["A", "C"] });
  });

  it("includes context in the rpc select prompt", async () => {
    const { tool } = setupTool();
    let promptTitle = "";

    await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        context: "Current deploy target is staging.",
        options: ["A", "B"],
      },
      undefined,
      undefined,
      {
        mode: "rpc",
        hasUI: true,
        ui: {
          select: async (title: string) => {
            promptTitle = title;
            return "A";
          },
        },
      },
    );

    expect(promptTitle).toContain("Current deploy target is staging.");
  });

  it("allows selecting an option literally named Type custom response", async () => {
    const { tool } = setupTool();
    const result = (await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        options: ["Type custom response", "B"],
        allowFreeform: true,
      },
      undefined,
      undefined,
      {
        mode: "rpc",
        hasUI: true,
        ui: {
          select: async () => "Type custom response",
        },
      },
    )) as { details: { response: unknown } };

    expect(result.details.response).toEqual({ kind: "selection", selections: ["Type custom response"] });
  });

  it("emits started and cancelled events for cancelled rpc ask_user flows", async () => {
    const { tool, emit } = setupTool();

    await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        options: ["A", "B"],
      },
      undefined,
      undefined,
      {
        mode: "rpc",
        hasUI: true,
        ui: {
          select: async () => null,
        },
      },
    );

    expect(emit).toHaveBeenNthCalledWith(1, ASK_USER_STARTED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
    expect(emit).toHaveBeenNthCalledWith(2, ASK_USER_CANCELLED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
  });

  it("emits started and answered events for tui ask_user flows", async () => {
    const { tool, emit } = setupTool();

    await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        options: ["A", "B"],
      },
      undefined,
      undefined,
      {
        mode: "tui",
        hasUI: true,
        ui: {
          custom: async () => ({ kind: "selection", selections: ["A"] }),
        },
      },
    );

    expect(emit).toHaveBeenNthCalledWith(1, ASK_USER_STARTED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
    expect(emit).toHaveBeenNthCalledWith(2, ASK_USER_ANSWERED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
  });

  it("emits started and cancelled events for cancelled tui ask_user flows", async () => {
    const { tool, emit } = setupTool();

    await tool.execute(
      "tool-1",
      {
        question: "Which option?",
        options: ["A", "B"],
      },
      undefined,
      undefined,
      {
        mode: "tui",
        hasUI: true,
        ui: {
          custom: async () => null,
        },
      },
    );

    expect(emit).toHaveBeenNthCalledWith(1, ASK_USER_STARTED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
    expect(emit).toHaveBeenNthCalledWith(2, ASK_USER_CANCELLED_EVENT, {
      question: "Which option?",
      context: undefined,
      optionCount: 2,
      allowMultiple: false,
      allowFreeform: true,
    });
  });
});

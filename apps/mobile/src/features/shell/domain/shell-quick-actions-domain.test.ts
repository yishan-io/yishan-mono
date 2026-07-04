import { describe, expect, it, vi } from "vitest";

import { wrapActionWithClose, wrapActionsWithClose } from "./shell-quick-actions-domain";

describe("shell-quick-actions-domain", () => {
  it("runs close before the wrapped action", () => {
    const calls: string[] = [];

    const wrapped = wrapActionWithClose(
      {
        id: "terminal",
        label: "Open terminal",
        onPress: () => {
          calls.push("action");
        },
      },
      () => {
        calls.push("close");
      },
    );

    wrapped.onPress();
    expect(calls).toEqual(["close", "action"]);
  });

  it("wraps every action in a list", () => {
    const onClose = vi.fn();
    const first = vi.fn();
    const second = vi.fn();

    const wrapped = wrapActionsWithClose(
      [
        { id: "first", onPress: first },
        { id: "second", onPress: second },
      ],
      onClose,
    );

    expect(wrapped).toHaveLength(2);
    wrapped?.[0]?.onPress();
    wrapped?.[1]?.onPress();

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("preserves nullish action collections", () => {
    expect(wrapActionsWithClose(null, vi.fn())).toBeUndefined();
    expect(wrapActionsWithClose(undefined, vi.fn())).toBeUndefined();
  });
});

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../../features/agent/model/agentChatTypes";
import { UserMessageRow } from "./UserMessageRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "agentChat.userMessage.showMore": "Show more",
        "agentChat.userMessage.showLess": "Show less",
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("./UserMessageContent", () => ({
  UserMessageContent: ({ messageText }: { messageText: string }) => <div data-testid="user-content">{messageText}</div>,
}));

let resizeCallback: (() => void) | undefined;

beforeEach(() => {
  resizeCallback = undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function userMessage(id: string, text: string): AgentMessage {
  return { id, role: "user", content: text };
}

function makeOverflowing(content: HTMLElement): void {
  Object.defineProperty(content, "scrollHeight", { value: 500, configurable: true });
  Object.defineProperty(content, "clientHeight", { value: 160, configurable: true });
}

describe("UserMessageRow", () => {
  it("renders the message text without an expand button when it is short", () => {
    render(<UserMessageRow message={userMessage("short-1", "short prompt")} />);

    expect(screen.getByTestId("user-content").textContent).toBe("short prompt");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
  });

  it("clamps an overflowing message and shows the expand button", () => {
    render(<UserMessageRow message={userMessage("long-1", "a".repeat(500))} />);

    const content = screen.getByTestId("user-message-content");
    makeOverflowing(content);
    act(() => {
      resizeCallback?.();
    });

    expect(window.getComputedStyle(content).maxHeight).toBe("160px");
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
  });

  it("expands to the full text on click and offers a collapse action", () => {
    render(<UserMessageRow message={userMessage("long-2", "a".repeat(500))} />);

    const content = screen.getByTestId("user-message-content");
    makeOverflowing(content);
    act(() => {
      resizeCallback?.();
    });

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(window.getComputedStyle(content).maxHeight).toBe("none");
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();

    // The ResizeObserver re-fires after the content grows; the toggle must survive it.
    act(() => {
      resizeCallback?.();
    });
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));

    expect(window.getComputedStyle(content).maxHeight).toBe("160px");
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
  });

  it("hides the expand affordance once the message no longer overflows", () => {
    render(<UserMessageRow message={userMessage("short-2", "short prompt")} />);

    const content = screen.getByTestId("user-message-content");
    makeOverflowing(content);
    act(() => {
      resizeCallback?.();
    });
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();

    Object.defineProperty(content, "scrollHeight", { value: 40, configurable: true });
    act(() => {
      resizeCallback?.();
    });
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("shows the human-readable timestamp when recorded", () => {
    render(<UserMessageRow message={userMessage("ts-1", "prompt")} />);

    expect(screen.queryByText(/^\d/)).toBeNull();

    cleanup();
    render(<UserMessageRow message={{ id: "u2", role: "user", content: "prompt", timestamp: 1_000_000_000_000 }} />);
    expect(screen.queryByText(/^\d/)).not.toBeNull();
  });
});

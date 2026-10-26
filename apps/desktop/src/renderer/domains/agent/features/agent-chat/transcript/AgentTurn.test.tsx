import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TurnDisplay } from "../../../chat/transcript/presentation.types";
import { AgentTurn } from "./AgentTurn";
beforeAll(async () => {
  const { initI18n, i18n } = await import("@renderer/i18n");
  await initI18n();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const turn: TurnDisplay = {
  id: "turn",
  blocks: [{ kind: "text", text: "Body", isStreaming: false }],
  summary: { text: "Final answer", thinking: [], isStreaming: false },
  isWorking: false,
  timingContinues: false,
  workedDurationMs: 1200,
};
describe("AgentTurn display", () => {
  it("renders ordered model blocks and keeps summary when collapsed across remount", () => {
    const view = renderWithAppTheme(<AgentTurn turn={turn} />);
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.getByText(/Worked 1s/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("agent-turn-header"));
    expect(screen.queryByText("Body")).toBeNull();
    expect(screen.getByText("Final answer")).toBeTruthy();
    view.unmount();
    renderWithAppTheme(<AgentTurn turn={turn} />);
    expect(screen.queryByText("Body")).toBeNull();
  });
  it("ticks only from explicit start and preserves absent timing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const view = renderWithAppTheme(<AgentTurn turn={{ ...turn, id: "live", isWorking: true, startedAtMs: 8000 }} />);
    expect(screen.getByText(/working 2s/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/working 3s/i)).toBeTruthy();
    view.rerender(<AgentTurn turn={{ ...turn, id: "live", isWorking: true, workedDurationMs: null }} />);
    expect(screen.queryByText(/working \ds/i)).toBeNull();
  });
});

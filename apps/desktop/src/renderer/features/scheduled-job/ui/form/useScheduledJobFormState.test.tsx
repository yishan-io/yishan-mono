// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { DEFAULT_FORM_DRAFT } from "../scheduledJobFormHelpers";
import { useScheduledJobFormState } from "./useScheduledJobFormState";

function createWrapper() {
  const queryClient = new QueryClient();

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useScheduledJobFormState", () => {
  it("switches between custom and preset schedules while keeping next-run preview safe for invalid cron input", async () => {
    const { result } = renderHook(
      () =>
        useScheduledJobFormState({
          initialState: {
            draft: DEFAULT_FORM_DRAFT,
            scheduleType: "weekday",
            scheduleTime: "09:00",
            weeklyDay: "1",
          },
          projects: [],
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.draft.cronExpression).toBe("0 9 * * 1-5");
    expect(result.current.nextRunEstimate).not.toBeNull();

    act(() => {
      result.current.setScheduleType("custom");
      result.current.setDraft((previousDraft) => ({ ...previousDraft, cronExpression: "bad cron" }));
    });

    await waitFor(() => {
      expect(result.current.nextRunEstimate).toBeNull();
    });

    act(() => {
      result.current.setScheduleType("weekly");
    });

    await waitFor(() => {
      expect(result.current.draft.cronExpression).toBe("0 9 * * 1");
    });

    act(() => {
      result.current.setScheduleTime("07:15");
    });

    await waitFor(() => {
      expect(result.current.draft.cronExpression).toBe("15 7 * * 1");
    });
  });
});

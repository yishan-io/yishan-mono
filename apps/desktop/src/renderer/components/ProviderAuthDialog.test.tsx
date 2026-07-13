// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopRpcEventEnvelope } from "../../main/ipc";
import type { ProviderAuthDialogBridge } from "./ProviderAuthDialog";
import { ProviderAuthDialog } from "./ProviderAuthDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createBridge() {
  let listener: ((event: DesktopRpcEventEnvelope) => void) | undefined;
  const respondPiAuthPrompt = vi.fn(async () => ({ ok: true as const }));
  const bridge: ProviderAuthDialogBridge = {
    host: { respondPiAuthPrompt },
    events: {
      subscribe: (nextListener) => {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      },
    },
  };
  return {
    bridge,
    respondPiAuthPrompt,
    emit: (event: DesktopRpcEventEnvelope) => {
      act(() => listener?.(event));
    },
  };
}

describe("ProviderAuthDialog", () => {
  afterEach(cleanup);

  it("renders secret prompts with the desktop dialog and submits the local value", async () => {
    const { bridge, emit, respondPiAuthPrompt } = createBridge();
    render(<ProviderAuthDialog bridge={bridge} />);

    emit({
      method: "piRuntime.authPrompt",
      payload: { requestId: "request-1", prompt: { type: "secret", message: "Enter Ant Ling API key" } },
    });

    const input = screen.getByRole("dialog").querySelector("input");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected provider auth input");
    }
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "ant-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.agentProviders.prompt.submit" }));

    expect(respondPiAuthPrompt).toHaveBeenCalledWith({
      requestId: "request-1",
      status: "submitted",
      value: "ant-secret",
    });
  });

  it("preserves provider-owned select option ids and supports cancellation", () => {
    const { bridge, emit, respondPiAuthPrompt } = createBridge();
    render(<ProviderAuthDialog bridge={bridge} />);

    emit({
      method: "piRuntime.authPrompt",
      payload: {
        requestId: "request-2",
        prompt: {
          type: "select",
          message: "Choose login method",
          options: [
            { id: "browser", label: "Browser" },
            { id: "device", label: "Device code" },
          ],
        },
      },
    });

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Choose login method" }));
    fireEvent.click(screen.getByRole("option", { name: "Device code" }));
    fireEvent.click(screen.getByRole("button", { name: "common.actions.cancel" }));

    expect(respondPiAuthPrompt).toHaveBeenCalledWith({ requestId: "request-2", status: "cancelled" });
  });
});

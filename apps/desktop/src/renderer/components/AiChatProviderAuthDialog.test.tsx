// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopRpcEventEnvelope } from "../../main/ipc";
import type { AiChatProviderAuthDialogBridge } from "./AiChatProviderAuthDialog";
import { AiChatProviderAuthDialog } from "./AiChatProviderAuthDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createBridge() {
  let listener: ((event: DesktopRpcEventEnvelope) => void) | undefined;
  const respondPiAuthPrompt = vi.fn<AiChatProviderAuthDialogBridge["respondPiAuthPrompt"]>(async () => ({
    ok: true,
  }));
  const bridge: AiChatProviderAuthDialogBridge = {
    respondPiAuthPrompt,
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

describe("AiChatProviderAuthDialog", () => {
  afterEach(cleanup);

  it("renders secret prompts with the desktop dialog and submits the local value", async () => {
    const { bridge, emit, respondPiAuthPrompt } = createBridge();
    render(<AiChatProviderAuthDialog bridge={bridge} />);

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
    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.prompt.submit" }));

    expect(respondPiAuthPrompt).toHaveBeenCalledWith({
      requestId: "request-1",
      status: "submitted",
      value: "ant-secret",
    });
  });

  it("preserves provider-owned select option ids and supports cancellation", () => {
    const { bridge, emit, respondPiAuthPrompt } = createBridge();
    render(<AiChatProviderAuthDialog bridge={bridge} />);

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

  it("keeps the prompt value visible and shows a recoverable response error", async () => {
    const { bridge, emit, respondPiAuthPrompt } = createBridge();
    respondPiAuthPrompt.mockResolvedValueOnce({ ok: false, errorMessage: "Prompt expired. Please retry." });
    render(<AiChatProviderAuthDialog bridge={bridge} />);

    emit({
      method: "piRuntime.authPrompt",
      payload: { requestId: "request-3", prompt: { type: "text", message: "Enter account ID" } },
    });
    const input = screen.getByRole("textbox", { name: "Enter account ID" });
    fireEvent.change(input, { target: { value: "account-123" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.prompt.submit" }));

    expect(await screen.findByText("Prompt expired. Please retry.")).toBeTruthy();
    const retainedInput = screen.getByRole("textbox", { name: "Enter account ID" });
    expect(retainedInput).toBeInstanceOf(HTMLInputElement);
    expect((retainedInput as HTMLInputElement).value).toBe("account-123");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes a matching prompt when the provider completes through the browser callback", () => {
    const { bridge, emit, respondPiAuthPrompt } = createBridge();
    render(<AiChatProviderAuthDialog bridge={bridge} />);

    emit({
      method: "piRuntime.authPrompt",
      payload: { requestId: "request-browser", prompt: { type: "text", message: "Paste redirect URL" } },
    });
    expect(screen.getByRole("dialog")).toBeTruthy();

    emit({ method: "piRuntime.authPromptClosed", payload: { requestId: "request-browser" } });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(respondPiAuthPrompt).not.toHaveBeenCalled();
  });

  it("keeps a newer prompt visible when an older response settles", async () => {
    const { bridge, emit, respondPiAuthPrompt } = createBridge();
    let resolveFirstResponse: ((result: { ok: true }) => void) | undefined;
    respondPiAuthPrompt.mockReturnValueOnce(
      new Promise<{ ok: true }>((resolve) => {
        resolveFirstResponse = resolve;
      }),
    );
    render(<AiChatProviderAuthDialog bridge={bridge} />);

    emit({
      method: "piRuntime.authPrompt",
      payload: { requestId: "request-old", prompt: { type: "text", message: "Enter account ID" } },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Enter account ID" }), {
      target: { value: "account-old" },
    });
    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.prompt.submit" }));

    emit({
      method: "piRuntime.authPrompt",
      payload: { requestId: "request-new", prompt: { type: "secret", message: "Enter API key" } },
    });
    const newInput = screen.getByRole("dialog").querySelector('input[aria-label="Enter API key"]');
    if (!(newInput instanceof HTMLInputElement)) {
      throw new Error("Expected the newer provider auth input");
    }
    fireEvent.change(newInput, { target: { value: "secret-new" } });

    await act(async () => {
      resolveFirstResponse?.({ ok: true });
    });

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(newInput.value).toBe("secret-new");
  });
});

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderCredentialDialog } from "./ProviderCredentialDialog";

const mocked = vi.hoisted(() => ({ openPiProviderLogin: vi.fn() }));

vi.mock("../../commands/piProviderCommands", () => ({
  NO_ACTIVE_WORKSPACE_LOGIN_ERROR: "no-active-workspace",
  openPiProviderLogin: mocked.openPiProviderLogin,
  savePiProvider: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("ProviderCredentialDialog login focus handoff", () => {
  let terminalInput: HTMLTextAreaElement;

  beforeEach(() => {
    terminalInput = document.createElement("textarea");
    document.body.append(terminalInput);
  });

  afterEach(() => {
    cleanup();
    terminalInput.remove();
    vi.resetAllMocks();
  });

  it("releases focus before launching login and never restores obsolete focus on success", async () => {
    const launcher = document.createElement("button");
    document.body.append(launcher);
    launcher.focus();
    let focusAtLaunch: Element | null = null;
    let resolveLogin!: () => void;
    const login = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });
    mocked.openPiProviderLogin.mockImplementationOnce(() => {
      terminalInput.focus();
      focusAtLaunch = document.activeElement;
      return login;
    });
    const onSaved = vi.fn();
    const props = {
      open: true,
      mode: "add" as const,
      initialProviderId: "openai-codex",
      onClose: vi.fn(),
      onSaved,
    };
    const dialog = render(<ProviderCredentialDialog {...props} />);
    try {
      fireEvent.click(screen.getByText("settings.providers.dialog.signInWithSubscription"));

      expect(focusAtLaunch).toBe(terminalInput);
      expect(document.activeElement).toBe(terminalInput);
      expect(onSaved).not.toHaveBeenCalled();
      // Check subsequent focus attempts while the asynchronous launch is pending too.
      terminalInput.blur();
      terminalInput.focus();
      expect(document.activeElement).toBe(terminalInput);

      await act(async () => resolveLogin());
      expect(onSaved).toHaveBeenCalledWith("openai-codex");
      dialog.rerender(<ProviderCredentialDialog {...props} open={false} />);
      expect(document.activeElement).toBe(terminalInput);
    } finally {
      launcher.remove();
    }
  });

  it.each([
    ["no-active-workspace", "settings.providers.errors.noWorkspace"],
    ["terminal unavailable", "settings.providers.errors.loginLaunchFailed"],
  ])("restores modal focus and allows retry after %s", async (message, errorKey) => {
    let rejectLogin!: (error: Error) => void;
    const login = new Promise<void>((_resolve, reject) => {
      rejectLogin = reject;
    });
    mocked.openPiProviderLogin.mockImplementationOnce(() => {
      terminalInput.focus();
      return login;
    });
    const onSaved = vi.fn();
    render(
      <ProviderCredentialDialog
        open
        mode="add"
        initialProviderId="openai-codex"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByText("settings.providers.dialog.signInWithSubscription"));
    expect(document.activeElement).toBe(terminalInput);

    await act(async () => rejectLogin(new Error(message)));
    expect(screen.getByRole("alert").textContent).toBe(errorKey);
    terminalInput.focus();
    // MUI enforces focus on its container, which wraps the role="dialog" paper.
    expect(document.activeElement).not.toBe(terminalInput);
    expect(screen.getByRole("dialog").parentElement?.contains(document.activeElement)).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();

    mocked.openPiProviderLogin.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByText("settings.providers.dialog.signInWithSubscription"));
    await act(async () => {});
    expect(mocked.openPiProviderLogin).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledWith("openai-codex");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPiRuntimeAuthCallbacks } from "./piRuntimeLoginBridge";

const BROWSER_CALLBACK_TIMEOUT_MS = 5 * 60_000;

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(async () => undefined),
  requestPrompt: vi.fn(async () => "submitted-value"),
  showInstructions: vi.fn(async () => undefined),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => [],
  },
  dialog: { showMessageBox: mocks.showInstructions },
  shell: { openExternal: mocks.openExternal },
}));

describe("Pi runtime login callback adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPrompt.mockResolvedValue("submitted-value");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects OpenAI browser login without exposing the headless device-code choice", async () => {
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt, "openai-codex");

    const selectedId = await callbacks.prompt({
      type: "select",
      message: "Select OpenAI Codex login method:",
      options: [
        { id: "browser", label: "Browser login (default)" },
        { id: "device_code", label: "Device code login (headless)" },
      ],
    });

    expect(selectedId).toBe("browser");
    expect(mocks.requestPrompt).not.toHaveBeenCalled();
  });

  it("never sends a manual redirect-code prompt to the renderer", async () => {
    const controller = new AbortController();
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt, "anthropic");

    const callbackWait = callbacks.prompt({
      type: "manual_code",
      message: "Paste the authorization code or redirect URL",
      signal: controller.signal,
    });
    controller.abort();

    await expect(callbackWait).rejects.toThrow("Browser callback wait cancelled.");
    expect(mocks.requestPrompt).not.toHaveBeenCalled();
  });

  it("cancels a hidden browser callback wait when the authentication session is aborted", async () => {
    const controller = new AbortController();
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt, "anthropic", controller.signal);

    const callbackWait = callbacks.prompt({
      type: "manual_code",
      message: "Paste the authorization code or redirect URL",
    });
    controller.abort(new Error("Login cancelled."));

    await expect(callbackWait).rejects.toThrow("Login cancelled.");
    expect(mocks.requestPrompt).not.toHaveBeenCalled();
  });

  it("fails a browser callback wait instead of falling back to manual entry", async () => {
    vi.useFakeTimers();
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt, "anthropic");

    const callbackWait = callbacks.prompt({
      type: "manual_code",
      message: "Paste the authorization code or redirect URL",
    });
    const rejection = expect(callbackWait).rejects.toThrow("Browser login timed out. Please retry.");
    await vi.advanceTimersByTimeAsync(BROWSER_CALLBACK_TIMEOUT_MS);

    await rejection;
    expect(mocks.requestPrompt).not.toHaveBeenCalled();
  });

  it("forwards Pi AI secret prompts without changing their type", async () => {
    mocks.requestPrompt.mockResolvedValue("cf-secret");
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt, "cloudflare-workers-ai");

    const value = await callbacks.prompt({ type: "secret", message: "Enter Cloudflare API key" });

    expect(value).toBe("cf-secret");
    expect(mocks.requestPrompt).toHaveBeenCalledWith({
      type: "secret",
      message: "Enter Cloudflare API key",
    });
  });

  it("opens device-code URLs for providers that only support that OAuth flow", async () => {
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt, "github-copilot");

    callbacks.notify({
      type: "device_code",
      userCode: "ABCD-1234",
      verificationUri: "https://example.com/device",
      expiresInSeconds: 900,
    });

    await vi.waitFor(() => {
      expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/device");
      expect(mocks.showInstructions).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("Enter code: ABCD-1234") }),
      );
    });
  });

  it("opens browser OAuth without showing an instruction dialog", async () => {
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt, "anthropic");

    callbacks.notify({
      type: "auth_url",
      url: "https://example.com/oauth",
      instructions: "Complete login in your browser.",
    });

    await vi.waitFor(() => {
      expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/oauth");
      expect(mocks.showInstructions).not.toHaveBeenCalled();
    });
  });
});

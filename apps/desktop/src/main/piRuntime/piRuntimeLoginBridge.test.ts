import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPiRuntimeAuthCallbacks } from "./piRuntimeLoginBridge";

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(async () => ({ opened: true as const })),
  requestPrompt: vi.fn(async () => "submitted-value"),
  showInstructions: vi.fn(async () => undefined),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => [],
  },
  dialog: { showMessageBox: mocks.showInstructions },
}));

vi.mock("../integrations/externalAppLauncher", () => ({
  openExternalUrl: mocks.openExternalUrl,
}));

describe("Pi runtime login callback adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPrompt.mockResolvedValue("submitted-value");
  });

  it("asks the renderer to choose the OpenAI login method before starting OAuth", async () => {
    mocks.requestPrompt.mockResolvedValue("device_code");
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt);

    const prompt = {
      type: "select",
      message: "Select OpenAI Codex login method:",
      options: [
        { id: "browser", label: "Browser login (default)" },
        { id: "device_code", label: "Device code login (headless)" },
      ],
    } as const;
    const selectedId = await callbacks.prompt(prompt);

    expect(selectedId).toBe("device_code");
    expect(mocks.requestPrompt).toHaveBeenCalledWith(prompt);
  });

  it("forwards the manual redirect-code fallback to the renderer", async () => {
    const controller = new AbortController();
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt);

    const value = await callbacks.prompt({
      type: "manual_code",
      message: "Paste the authorization code or redirect URL",
      placeholder: "http://localhost:1455/auth/callback",
      signal: controller.signal,
    });

    expect(value).toBe("submitted-value");
    expect(mocks.requestPrompt).toHaveBeenCalledWith(
      {
        type: "text",
        message: "Paste the authorization code or redirect URL",
        placeholder: "http://localhost:1455/auth/callback",
      },
      controller.signal,
    );
  });

  it("forwards Pi AI secret prompts without changing their type", async () => {
    mocks.requestPrompt.mockResolvedValue("cf-secret");
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt);

    const value = await callbacks.prompt({ type: "secret", message: "Enter Cloudflare API key" });

    expect(value).toBe("cf-secret");
    expect(mocks.requestPrompt).toHaveBeenCalledWith({
      type: "secret",
      message: "Enter Cloudflare API key",
    });
  });

  it("opens device-code URLs for providers that only support that OAuth flow", async () => {
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt);

    callbacks.notify({
      type: "device_code",
      userCode: "ABCD-1234",
      verificationUri: "https://example.com/device",
      expiresInSeconds: 900,
    });

    await vi.waitFor(() => {
      expect(mocks.openExternalUrl).toHaveBeenCalledWith("https://example.com/device", {
        allowedProtocols: ["https:"],
      });
      expect(mocks.showInstructions).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("Enter code: ABCD-1234") }),
      );
    });
  });

  it("opens browser OAuth without showing an instruction dialog", async () => {
    const callbacks = createPiRuntimeAuthCallbacks(undefined, mocks.requestPrompt);

    callbacks.notify({
      type: "auth_url",
      url: "https://example.com/oauth",
      instructions: "Complete login in your browser.",
    });

    await vi.waitFor(() => {
      expect(mocks.openExternalUrl).toHaveBeenCalledWith("https://example.com/oauth", {
        allowedProtocols: ["https:"],
      });
      expect(mocks.showInstructions).not.toHaveBeenCalled();
    });
  });
});

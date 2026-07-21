// @vitest-environment jsdom

import { NotificationSettingsView as NotificationSettingsPanel } from "@renderer/views/settings/notifications/NotificationSettingsView";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getNotificationPreferencesMock: vi.fn(),
  updateNotificationPreferencesMock: vi.fn(),
  previewNotificationMock: vi.fn(),
  playNotificationSoundMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@renderer/commands/notificationCommands", () => ({
  getNotificationPreferences: mocked.getNotificationPreferencesMock,
  updateNotificationPreferences: mocked.updateNotificationPreferencesMock,
  previewNotification: mocked.previewNotificationMock,
  playNotificationSound: mocked.playNotificationSoundMock,
}));

describe("NotificationSettingsPanel", () => {
  beforeEach(() => {
    mocked.getNotificationPreferencesMock.mockReset();
    mocked.updateNotificationPreferencesMock.mockReset();
    mocked.previewNotificationMock.mockReset();
    mocked.playNotificationSoundMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads preferences and persists OS-notification toggle edits immediately through RPC", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: false,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    const switches = await screen.findAllByRole("switch");
    const enabledSwitch = switches[0];
    if (!enabledSwitch) {
      throw new Error("Expected an enabled notifications switch.");
    }
    fireEvent.click(enabledSwitch);

    await waitFor(() => {
      expect(mocked.updateNotificationPreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          volume: 0.5,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("org.settings.notifications.soundEnabled")).toBeNull();
      expect(screen.queryByText("org.settings.notifications.events.title")).toBeNull();
    });

    expect(screen.queryByRole("button", { name: "common.actions.save" })).toBeNull();
  });

  it("does not show a run-type section when notifications only support AI tasks", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    expect(screen.queryByText("org.settings.notifications.runTypes.title")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "org.settings.notifications.runTypes.items.ai-task" })).toBeNull();
  });

  it("hides sound configuration rows when play notification sound is turned off", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: false,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    const switches = await screen.findAllByRole("switch");
    fireEvent.click(switches[switches.length - 1] as HTMLElement);

    await waitFor(() => {
      expect(mocked.updateNotificationPreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          soundEnabled: false,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("org.settings.notifications.volume")).toBeNull();
      expect(
        screen.queryAllByRole("combobox", {
          name: /org\.settings\.notifications\.soundSelection$/,
        }),
      ).toHaveLength(0);
    });
  });

  it("triggers preview with current draft preferences", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "org.settings.notifications.preview.button" }));

    await waitFor(() => {
      expect(mocked.previewNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "run-finished",
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText("org.settings.notifications.preview.status.success")).toBeTruthy();
    });
    expect(screen.queryByText("org.settings.notifications.preview.sent")).toBeNull();
  });

  it("shows zip in sound dropdown options for event sound selection", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    const runFinishedSoundSelect = screen.getByRole("combobox", {
      name: "org.settings.notifications.events.runFinished org.settings.notifications.soundSelection",
    });
    fireEvent.mouseDown(runFinishedSoundSelect);

    expect(await screen.findByRole("option", { name: "org.settings.notifications.sounds.zip" })).toBeTruthy();
  });

  it("shows pending question event sound configuration", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed", "pending-question"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
        "pending-question": "ping",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed", "pending-question"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
        "pending-question": "ping",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "pending-question",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "pending-question",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    expect(
      screen.getByRole("combobox", {
        name: "org.settings.notifications.events.pendingQuestion org.settings.notifications.soundSelection",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "org.settings.notifications.events.pendingQuestion" })).toBeTruthy();
  });

  it("shows failed preview status icon when notification preview is blocked", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: false,
      reason: "event-disabled",
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "org.settings.notifications.preview.button" }));

    await waitFor(() => {
      expect(screen.getByLabelText("org.settings.notifications.preview.status.failed")).toBeTruthy();
    });
    expect(screen.queryByText("org.settings.notifications.preview.blocked")).toBeNull();
  });

  it("auto-hides notification preview status after a short delay", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "org.settings.notifications.preview.button" }));

    await waitFor(() => {
      expect(screen.getByLabelText("org.settings.notifications.preview.status.success")).toBeTruthy();
    });

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2800);
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText("org.settings.notifications.preview.status.success")).toBeNull();
    });
  }, 10000);

  it("previews the newly selected sound when dropdown selection changes", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "ping",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-finished",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    fireEvent.mouseDown(
      await screen.findByRole("combobox", {
        name: "org.settings.notifications.events.runFailed org.settings.notifications.soundSelection",
      }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "org.settings.notifications.sounds.ping" }));

    await waitFor(() => {
      expect(mocked.playNotificationSoundMock).toHaveBeenCalledWith({
        soundId: "ping",
        volume: 0.5,
      });
    });
  });

  it("previews event sound with current draft settings", async () => {
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-failed",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    fireEvent.mouseDown(
      screen.getByRole("combobox", {
        name: "org.settings.notifications.events.runFailed org.settings.notifications.soundSelection",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "org.settings.notifications.sounds.alert org.settings.notifications.preview.soundButton",
      }),
    );

    await waitFor(() => {
      expect(mocked.playNotificationSoundMock).toHaveBeenCalledWith({
        soundId: "alert",
        volume: 0.5,
      });
    });
    expect(screen.queryByText("org.settings.notifications.preview.soundPlayed")).toBeNull();
  });

  it("queues the latest sound preview request while one preview is still running", async () => {
    let resolveFirstPreview: (() => void) | undefined;
    mocked.getNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.updateNotificationPreferencesMock.mockResolvedValue({
      enabled: true,
      soundEnabled: true,
      volume: 0.5,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });
    mocked.previewNotificationMock.mockResolvedValue({
      sent: true,
      eventType: "run-finished",
    });
    mocked.playNotificationSoundMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstPreview = () => resolve({ played: true, eventType: "run-failed" });
        }),
    );
    mocked.playNotificationSoundMock.mockResolvedValue({
      played: true,
      eventType: "run-failed",
    });

    render(<NotificationSettingsPanel />);

    await waitFor(() => {
      expect(mocked.getNotificationPreferencesMock).toHaveBeenCalled();
    });

    fireEvent.mouseDown(
      screen.getByRole("combobox", {
        name: "org.settings.notifications.events.runFailed org.settings.notifications.soundSelection",
      }),
    );

    const alertPreviewButton = await screen.findByRole("button", {
      name: "org.settings.notifications.sounds.alert org.settings.notifications.preview.soundButton",
    });
    const chimePreviewButton = await screen.findByRole("button", {
      name: "org.settings.notifications.sounds.chime org.settings.notifications.preview.soundButton",
    });

    fireEvent.click(alertPreviewButton);

    await waitFor(() => {
      expect(alertPreviewButton.getAttribute("aria-busy")).toBe("true");
    });
    expect(alertPreviewButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(chimePreviewButton);

    expect(mocked.playNotificationSoundMock).toHaveBeenCalledTimes(1);

    resolveFirstPreview?.();

    await waitFor(() => {
      expect(mocked.playNotificationSoundMock).toHaveBeenCalledTimes(2);
    });
    expect(mocked.playNotificationSoundMock).toHaveBeenNthCalledWith(2, {
      soundId: "chime",
      volume: 0.5,
    });

    await waitFor(() => {
      expect(alertPreviewButton.getAttribute("aria-busy")).toBe("false");
      expect(chimePreviewButton.getAttribute("aria-busy")).toBe("false");
    });
  });
});

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateSnackbar } from "./AppUpdateSnackbar";

const getPendingUpdate = vi.hoisted(() => vi.fn());
const dismissUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDesktopBridge: () => ({
    host: {
      getPendingUpdate,
    },
    events: {
      subscribe: vi.fn(() => () => undefined),
    },
  }),
  getDesktopHostBridge: () => ({
    dismissUpdate,
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
  }),
}));

describe("AppUpdateSnackbar", () => {
  beforeEach(() => {
    getPendingUpdate.mockReset();
    dismissUpdate.mockClear();
  });

  it("dismisses auto update availability through the host bridge", async () => {
    getPendingUpdate.mockResolvedValue({ status: "available", source: "auto", version: "1.2.3" });

    render(<AppUpdateSnackbar />);

    fireEvent.click(await screen.findByLabelText("app.update.closeAria"));

    await waitFor(() => {
      expect(dismissUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("does not dismiss manual update availability through the host bridge", async () => {
    getPendingUpdate.mockResolvedValue({ status: "available", source: "manual", version: "1.2.3" });

    render(<AppUpdateSnackbar />);

    fireEvent.click(await screen.findByLabelText("app.update.closeAria"));

    expect(dismissUpdate).not.toHaveBeenCalled();
  });
});

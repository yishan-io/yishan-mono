// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
  webLinksOpenHandler: null as ((event: MouseEvent, uri: string) => void) | null,
}));

vi.mock("../../commands/appCommands", () => ({
  openExternalUrl: (url: string) => mocks.openExternalUrl(url),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor(openHandler: (event: MouseEvent, uri: string) => void) {
      mocks.webLinksOpenHandler = openHandler;
    }

    activate(): void {}

    dispose(): void {}
  },
}));

import { loadTerminalAddons } from "./terminalAddons";

describe("loadTerminalAddons", () => {
  it("loads fit addon first and attempts all stable addons", () => {
    const terminal = {
      loadAddon: vi.fn(),
    };
    const logger = {
      warn: vi.fn(),
    };

    const addons = loadTerminalAddons(terminal, logger);

    expect(terminal.loadAddon).toHaveBeenCalledTimes(7);
    expect(terminal.loadAddon.mock.calls[0]?.[0]).toBe(addons.fitAddon);
    expect(terminal.loadAddon.mock.calls[1]?.[0]).toBe(addons.searchAddon);
  });

  it("logs and continues when an addon fails to load", () => {
    let attempt = 0;
    const terminal = {
      loadAddon: vi.fn(() => {
        attempt += 1;
        if (attempt === 3) {
          throw new Error("no webgl support");
        }
      }),
    };
    const logger = {
      warn: vi.fn(),
    };

    loadTerminalAddons(terminal, logger);

    expect(terminal.loadAddon).toHaveBeenCalledTimes(7);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to load xterm webgl addon",
      expect.objectContaining({ message: "no webgl support" }),
    );
  });

  it("opens xterm links through desktop host bridge", async () => {
    const terminal = {
      loadAddon: vi.fn(),
    };
    const logger = {
      warn: vi.fn(),
    };
    const windowOpen = vi.spyOn(window, "open");
    mocks.openExternalUrl.mockResolvedValueOnce({ opened: true });

    loadTerminalAddons(terminal, logger);

    const preventDefault = vi.fn();
    mocks.webLinksOpenHandler?.({ preventDefault } as unknown as MouseEvent, "https://yishan.dev/docs");

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(mocks.openExternalUrl).toHaveBeenCalledWith("https://yishan.dev/docs");
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
    windowOpen.mockRestore();
  });

  it("logs when host bridge rejects one xterm URL", async () => {
    const terminal = {
      loadAddon: vi.fn(),
    };
    const logger = {
      warn: vi.fn(),
    };
    mocks.openExternalUrl.mockResolvedValueOnce({
      opened: false,
      reason: "unsupported-protocol",
    });

    loadTerminalAddons(terminal, logger);

    const preventDefault = vi.fn();
    mocks.webLinksOpenHandler?.({ preventDefault } as unknown as MouseEvent, "file:///tmp/private.txt");

    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith("Failed to open xterm external link (unsupported-protocol)", {
        uri: "file:///tmp/private.txt",
      });
    });
  });
});

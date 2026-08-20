import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickLocalFolder } from "./folderPicker";

const mocks = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));

vi.mock("electron", () => ({ dialog: { showOpenDialog: mocks.showOpenDialog } }));

describe("pickLocalFolder", () => {
  beforeEach(() => {
    mocks.showOpenDialog.mockReset();
  });

  it("returns null when the native dialog is cancelled", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: ["/ignored"] });

    await expect(pickLocalFolder(null, { startingFolder: " /workspace " })).resolves.toBeNull();
    expect(mocks.showOpenDialog).toHaveBeenCalledWith({
      properties: ["openDirectory", "createDirectory"],
      defaultPath: "/workspace",
    });
  });

  it("uses the main window when it is available", async () => {
    const browserWindow = {} as Electron.BrowserWindow;
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/workspace"] });

    await expect(pickLocalFolder(browserWindow)).resolves.toBe("/workspace");
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(browserWindow, {
      properties: ["openDirectory", "createDirectory"],
      defaultPath: undefined,
    });
  });
});

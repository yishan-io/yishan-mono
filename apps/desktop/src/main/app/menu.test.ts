import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { ACTIONS } from "../../shared/contracts/actions";
import { buildApplicationMenuTemplate, configureApplicationMenu, toElectronAccelerator } from "./menu";

const mocks = vi.hoisted(() => ({
  app: { name: "Yishan" },
  buildFromTemplate: vi.fn((template) => ({ template })),
  setApplicationMenu: vi.fn(),
}));

vi.mock("electron", () => ({
  app: mocks.app,
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
    setApplicationMenu: mocks.setApplicationMenu,
  },
}));

function invokeMenuItemClick(item: MenuItemConstructorOptions | undefined): void {
  const click = item && "click" in item ? item.click : undefined;
  click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);
}

describe("toElectronAccelerator", () => {
  it("converts centralized shortcut strings into Electron accelerator syntax", () => {
    expect(toElectronAccelerator("ctrl+shift+p, command+shift+p")).toBe("CmdOrCtrl+Shift+P");
    expect(toElectronAccelerator("ctrl+backspace")).toBe("CmdOrCtrl+Backspace");
    expect(toElectronAccelerator("delete")).toBe("Delete");
  });
});

describe("buildApplicationMenuTemplate", () => {
  it("dispatches renderer app actions from native menu items", () => {
    const dispatchAction = vi.fn();
    const template = buildApplicationMenuTemplate({ dispatchAction, appName: "Yishan", locale: "en" });
    const appMenu = template[0]?.submenu;
    const editMenu = template[2]?.submenu;
    const viewMenu = template[3]?.submenu;

    if (!Array.isArray(appMenu) || !Array.isArray(editMenu) || !Array.isArray(viewMenu)) {
      throw new Error("expected menu submenus to be arrays");
    }

    const preferencesItem = appMenu.find((item) => "label" in item && item.label === "Preferences");
    const undoFileItem = editMenu.find((item) => "label" in item && item.label === "Undo last file tree operation");
    const deleteFileItem = editMenu.find((item) => "label" in item && item.label === "Delete Selected File");
    const toggleLeftPaneItem = viewMenu.find((item) => "label" in item && item.label === "Toggle left sidebar");
    const toggleRightPaneItem = viewMenu.find((item) => "label" in item && item.label === "Toggle right sidebar");

    invokeMenuItemClick(preferencesItem);
    invokeMenuItemClick(undoFileItem);
    invokeMenuItemClick(deleteFileItem);
    invokeMenuItemClick(toggleLeftPaneItem);
    invokeMenuItemClick(toggleRightPaneItem);

    expect(dispatchAction).toHaveBeenCalledWith({ action: ACTIONS.NAVIGATE, path: "/settings" }, { focusApp: true });
    expect(dispatchAction).toHaveBeenCalledWith({ action: ACTIONS.FILE_UNDO });
    expect(dispatchAction).toHaveBeenCalledWith({ action: ACTIONS.FILE_DELETE });
    expect(dispatchAction).toHaveBeenCalledWith({ action: ACTIONS.TOGGLE_LEFT_PANE });
    expect(dispatchAction).toHaveBeenCalledWith({ action: ACTIONS.TOGGLE_RIGHT_PANE });
  });

  it("does not assign a default accelerator to the right sidebar toggle", () => {
    const template = buildApplicationMenuTemplate({ appName: "Yishan", locale: "en" });
    const viewMenu = template[3]?.submenu;

    if (!Array.isArray(viewMenu)) {
      throw new Error("expected view submenu to be an array");
    }

    const toggleRightPaneItem = viewMenu.find((item) => "label" in item && item.label === "Toggle right sidebar");

    expect(toggleRightPaneItem).toBeTruthy();
    expect(toggleRightPaneItem && "accelerator" in toggleRightPaneItem ? toggleRightPaneItem.accelerator : undefined).toBeUndefined();
  });

  it("uses Chinese labels for Chinese locales", () => {
    const template = buildApplicationMenuTemplate({ appName: "Yishan", locale: "zh-CN" });
    const editMenu = template[2]?.submenu;

    if (!Array.isArray(editMenu)) {
      throw new Error("expected edit submenu to be an array");
    }

    expect(editMenu.some((item) => "label" in item && item.label === "删除所选文件")).toBe(true);
  });

  it("only includes the devtools menu item in dev mode", () => {
    const productionTemplate = buildApplicationMenuTemplate({ appName: "Yishan", devMode: false });
    const devTemplate = buildApplicationMenuTemplate({ appName: "Yishan", devMode: true });
    const productionHelpMenu = productionTemplate[5]?.submenu;
    const devHelpMenu = devTemplate[5]?.submenu;

    if (!Array.isArray(productionHelpMenu) || !Array.isArray(devHelpMenu)) {
      throw new Error("expected help submenus to be arrays");
    }

    expect(productionHelpMenu.some((item) => "role" in item && item.role === "toggleDevTools")).toBe(false);
    expect(devHelpMenu.some((item) => "role" in item && item.role === "toggleDevTools")).toBe(true);
  });
});

describe("configureApplicationMenu", () => {
  it("applies the native menu only on macOS", () => {
    const menuApi = {
      buildFromTemplate: vi.fn((template) => ({ template })),
      setApplicationMenu: vi.fn(),
    };

    configureApplicationMenu({ platform: "linux", menuApi });
    expect(menuApi.setApplicationMenu).not.toHaveBeenCalled();

    configureApplicationMenu({ platform: "darwin", menuApi });
    expect(menuApi.buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(menuApi.setApplicationMenu).toHaveBeenCalledTimes(1);
  });
});

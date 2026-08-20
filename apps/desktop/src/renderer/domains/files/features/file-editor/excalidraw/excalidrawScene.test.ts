// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

/**
 * The @excalidraw/excalidraw barrel file has module-level side effects
 * (React components, browser globals) that crash jsdom. We mock the two
 * functions our helpers depend on with faithful-enough implementations.
 *
 * Mock signatures mirror the confirmed 0.18.1 API:
 *   restore(data: {appState, elements, files} | null, null, null)
 *   serializeAsJSON(elements, appState, files, type)
 *
 * Semantics note: the real serializeAsJSON ignores appState.source (it writes
 * window.EXCALIDRAW_EXPORT_SOURCE instead) and keeps only a fixed set of
 * appState fields (viewBackgroundColor, gridSize, gridStep, gridModeEnabled).
 * The mock mirrors the former but not the latter (keeps full appState) —
 * transient-stripping is asserted at the helper level instead.
 */
vi.mock("@excalidraw/excalidraw", () => {
  // biome-ignore lint/suspicious/noExplicitAny: mock signatures match the real package's loose JSON-shaped data
  function restore(data: any, _localAppState: any, _localElements: any) {
    if (!data) {
      return { elements: [], appState: {}, files: {} };
    }
    return {
      elements: data.elements ?? [],
      appState: { viewBackgroundColor: "#ffffff", ...(data.appState ?? {}) },
      files: data.files ?? {},
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: mock signatures match the real package's loose JSON-shaped data
  function serializeAsJSON(elements: any, appState: any, files: any, _type: string) {
    return JSON.stringify({
      type: "excalidraw",
      version: 2,
      // The real package writes window.EXCALIDRAW_EXPORT_SOURCE, never appState.source.
      source: "mock-export-source",
      elements,
      appState,
      files,
    });
  }

  return { restore, serializeAsJSON };
});

// Must import after the mock is declared.
import {
  createEmptyScene,
  normalizeTransientAppState,
  parseExcalidrawScene,
  pickSceneAppState,
  serializeExcalidrawScene,
} from "./excalidrawScene";
import type { ParsedExcalidrawScene } from "./excalidrawScene";

/**
 * Minimal element shape accepted by the mocked restore/serializeAsJSON.
 * We use a plain object cast to avoid importing branded types from the real package.
 */
// biome-ignore lint/suspicious/noExplicitAny: test fixture bypasses branded types from the real package
function makeRectangle(id: string): any {
  return {
    id,
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    angle: 0,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    seed: 42,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
  };
}

function minimalScene(overrides?: Partial<ParsedExcalidrawScene>): ParsedExcalidrawScene {
  return {
    elements: [makeRectangle("elem-1")],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
    ...overrides,
  };
}

describe("parseExcalidrawScene", () => {
  it("returns empty scene for empty string", () => {
    const result = parseExcalidrawScene("");
    expect(result.elements).toEqual([]);
    expect(result.appState).toEqual({});
    expect(result.files).toEqual({});
  });

  it("returns empty scene for whitespace-only input", () => {
    expect(parseExcalidrawScene("   \n\t  ").elements).toEqual([]);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseExcalidrawScene("{not json")).toThrow(/^Invalid Excalidraw JSON:/);
  });

  it("throws on JSON primitives", () => {
    expect(() => parseExcalidrawScene("42")).toThrow(/expected an object/);
    expect(() => parseExcalidrawScene("[1, 2]")).toThrow(/expected an object/);
    expect(() => parseExcalidrawScene('"foo"')).toThrow(/expected an object/);
    expect(() => parseExcalidrawScene("null")).toThrow(/expected an object/);
  });

  it("throws when elements is missing or not an array", () => {
    expect(() => parseExcalidrawScene('{"appState": {}}')).toThrow(/missing elements array/);
    expect(() => parseExcalidrawScene('{"elements": "nope"}')).toThrow(/missing elements array/);
  });

  it("round-trips a serialized scene", () => {
    const original = minimalScene();
    const json = serializeExcalidrawScene(original);
    const parsed = parseExcalidrawScene(json);
    expect(parsed.elements.length).toBe(1);
    expect(parsed.elements[0]?.type).toBe("rectangle");
    expect(parsed.elements[0]?.id).toBe("elem-1");
  });
});

describe("serializeExcalidrawScene", () => {
  it("does not inject source into appState (real package owns the source field)", () => {
    const scene = minimalScene({ appState: { source: "excalidraw-cli" } });
    const json = serializeExcalidrawScene(scene);
    const parsed = JSON.parse(json);
    // The mock mirrors the real package: source is not taken from appState.
    expect(parsed.source).toBe("mock-export-source");
    expect(parsed.appState.source).toBe("excalidraw-cli");
  });

  it("preserves viewBackgroundColor in serialized output", () => {
    const scene = minimalScene({ appState: { viewBackgroundColor: "#ff0000" } });
    const json = serializeExcalidrawScene(scene);
    expect(JSON.parse(json).appState?.viewBackgroundColor).toBe("#ff0000");
  });

  it("does not mutate the input appState", () => {
    const appState = { viewBackgroundColor: "#ffffff", scrollX: 100 };
    serializeExcalidrawScene(minimalScene({ appState }));
    expect(appState).toHaveProperty("scrollX", 100);
  });
});

describe("normalizeTransientAppState", () => {
  it("strips transient fields", () => {
    const appState = {
      viewBackgroundColor: "#ffffff",
      scrollX: 100,
      scrollY: 200,
      zoom: { value: 2 },
      selectedElementIds: { "elem-1": true },
      selectionElement: { type: "selection", id: "sel-1" },
      editingGroupId: "g-1",
      editingTextElement: { id: "edit-1" },
      editingLinearElement: { elementId: "line-1" },
    };

    const normalized = normalizeTransientAppState(appState);

    expect(normalized).toHaveProperty("viewBackgroundColor", "#ffffff");
    expect(normalized).not.toHaveProperty("scrollX");
    expect(normalized).not.toHaveProperty("scrollY");
    expect(normalized).not.toHaveProperty("zoom");
    expect(normalized).not.toHaveProperty("selectedElementIds");
    expect(normalized).not.toHaveProperty("selectionElement");
    expect(normalized).not.toHaveProperty("editingGroupId");
    expect(normalized).not.toHaveProperty("editingTextElement");
    expect(normalized).not.toHaveProperty("editingLinearElement");
  });

  it("does not mutate the input", () => {
    const appState = { viewBackgroundColor: "#ffffff", scrollX: 100 };
    normalizeTransientAppState(appState);
    expect(appState).toHaveProperty("scrollX", 100);
  });

  it("serialization is deterministic regardless of transient state", () => {
    const baseScene = minimalScene({ appState: { viewBackgroundColor: "#ffffff" } });

    const withScroll = {
      ...baseScene,
      appState: { ...baseScene.appState, scrollX: 42, scrollY: 17, zoom: { value: 1.5 } },
    };

    const withSelection = {
      ...baseScene,
      appState: {
        ...baseScene.appState,
        selectedElementIds: { "elem-2": true },
        editingTextElement: { id: "edit-1" },
      },
    };

    const jsonBase = serializeExcalidrawScene(baseScene);
    const jsonScroll = serializeExcalidrawScene(withScroll);
    const jsonSelection = serializeExcalidrawScene(withSelection);

    // All three should produce byte-identical output because the transient
    // fields that differ between them are stripped before serialization.
    expect(jsonScroll).toBe(jsonBase);
    expect(jsonSelection).toBe(jsonBase);
  });
});

describe("pickSceneAppState", () => {
  it("keeps only scene-content fields", () => {
    const appState = {
      viewBackgroundColor: "#123456",
      gridSize: 20,
      gridStep: 5,
      gridModeEnabled: true,
      theme: "dark",
      activeTool: { type: "arrow" },
      scrollX: 10,
    };

    const picked = pickSceneAppState(appState);

    expect(picked).toEqual({
      viewBackgroundColor: "#123456",
      gridSize: 20,
      gridStep: 5,
      gridModeEnabled: true,
    });
  });

  it("does not mutate the input", () => {
    const appState = { viewBackgroundColor: "#fff", theme: "dark" };
    pickSceneAppState(appState);
    expect(appState).toHaveProperty("theme", "dark");
  });
});

describe("createEmptyScene", () => {
  it("returns a restore-defaulted empty scene", () => {
    const scene = createEmptyScene();
    expect(scene.elements).toEqual([]);
    expect(scene.files).toEqual({});
    // The mock restore fills default viewBackgroundColor like the real one.
    expect(scene.appState).toHaveProperty("viewBackgroundColor", "#ffffff");
  });
});

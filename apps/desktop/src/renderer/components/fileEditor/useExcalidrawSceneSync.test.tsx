// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Semantic mocks of the scene helpers (the real @excalidraw/excalidraw barrel
 * crashes jsdom). The mock canvas payloads below mirror the real canvas: the
 * mount onChange carries a restore-defaulted appState (viewBackgroundColor),
 * and user edits may carry transient fields that serialization strips.
 */
vi.mock("../../helpers/excalidrawScene", () => {
  const TRANSIENT_KEYS = new Set([
    "scrollX",
    "scrollY",
    "zoom",
    "selectedElementIds",
    "selectionElement",
    "editingGroupId",
    "editingTextElement",
    "editingLinearElement",
  ]);
  const SCENE_CONTENT_KEYS = ["viewBackgroundColor", "gridSize", "gridStep", "gridModeEnabled"];

  function normalizeAppState(appState: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(appState ?? {})) {
      if (!TRANSIENT_KEYS.has(key)) {
        out[key] = appState[key];
      }
    }
    return out;
  }

  function parseExcalidrawScene(json: string) {
    const trimmed = String(json).trim();
    if (!trimmed) {
      return { elements: [], appState: {}, files: {} };
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(trimmed) as Record<string, unknown>;
    } catch (cause) {
      throw new Error(`Invalid Excalidraw JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.elements)) {
      throw new Error("Invalid Excalidraw JSON: missing elements array");
    }
    return {
      elements: data.elements,
      appState: (data.appState as Record<string, unknown> | undefined) ?? {},
      files: (data.files as Record<string, unknown> | undefined) ?? {},
    };
  }

  function serializeExcalidrawScene(scene: { elements: unknown[]; appState: Record<string, unknown>; files: unknown }) {
    return JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "yishan",
      elements: scene.elements,
      appState: normalizeAppState(scene.appState),
      files: scene.files,
    });
  }

  function createEmptyScene() {
    return { elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };
  }

  function pickSceneAppState(appState: Record<string, unknown>): Record<string, unknown> {
    const picked: Record<string, unknown> = {};
    for (const key of SCENE_CONTENT_KEYS) {
      if (key in appState) {
        picked[key] = appState[key];
      }
    }
    return picked;
  }

  return { parseExcalidrawScene, serializeExcalidrawScene, createEmptyScene, pickSceneAppState };
});

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useExcalidrawSceneSync } from "./useExcalidrawSceneSync";

const CANVAS_DEFAULT_APP_STATE = { viewBackgroundColor: "#ffffff" };

// biome-ignore lint/suspicious/noExplicitAny: test fixture bypasses the real package's branded ExcalidrawElement type
function element(id: string, label: string): any {
  return { id, type: "text", text: label, x: 0, y: 0 };
}

// biome-ignore lint/suspicious/noExplicitAny: test fixture bypasses the real package's branded DataURL type
function fileData(): any {
  return { mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" };
}

function sceneJson(elements: unknown[], appState?: Record<string, unknown>) {
  return JSON.stringify({ type: "excalidraw", version: 2, source: "yishan", elements, appState: appState ?? {}, files: {} });
}

function makeApi() {
  const updateScene = vi.fn();
  const addFiles = vi.fn();
  return { updateScene, addFiles };
}

function actAdvance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useExcalidrawSceneSync", () => {
  it("does not publish on mount for empty content (no false dirty)", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const { result, unmount } = renderHook(() => useExcalidrawSceneSync({ content: "", onContentChange }));

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));
    // Canvas mount onChange with the restore-defaulted empty scene.
    act(() => result.current.handleChange([], CANVAS_DEFAULT_APP_STATE, {}));
    actAdvance(500);

    expect(onContentChange).not.toHaveBeenCalled();
    unmount();
  });

  it("publishes a user edit once, after the debounce window", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const { result, unmount } = renderHook(() => useExcalidrawSceneSync({ content: "", onContentChange }));

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));
    act(() => result.current.handleChange([element("e1", "hello")], CANVAS_DEFAULT_APP_STATE, {}));

    // Before the debounce fires: nothing published.
    actAdvance(100);
    expect(onContentChange).not.toHaveBeenCalled();

    actAdvance(200);
    expect(onContentChange).toHaveBeenCalledTimes(1);
    const published = onContentChange.mock.calls[0]?.[0] as string;
    expect(JSON.parse(published).elements).toHaveLength(1);

    // No repeat publishes after settling.
    actAdvance(1000);
    expect(onContentChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("transient fields in edits do not trigger extra publishes", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const { result, unmount } = renderHook(() => useExcalidrawSceneSync({ content: "", onContentChange }));

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));
    act(() =>
      result.current.handleChange(
        [element("e1", "hello")],
        { ...CANVAS_DEFAULT_APP_STATE, scrollX: 5, selectedElementIds: { e1: true } },
        {},
      ),
    );
    actAdvance(500);
    expect(onContentChange).toHaveBeenCalledTimes(1);

    // A viewport-only change afterwards must not publish.
    act(() => result.current.handleChange([element("e1", "hello")], { ...CANVAS_DEFAULT_APP_STATE, scrollX: 999 }, {}));
    actAdvance(500);
    expect(onContentChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("applies disk refresh via updateScene with scene-content appState only, plus addFiles", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const first = sceneJson([element("e1", "one")], { viewBackgroundColor: "#ffffff" });
    const { result, unmount, rerender } = renderHook(
      ({ content }) => useExcalidrawSceneSync({ content, onContentChange }),
      { initialProps: { content: first } },
    );

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));
    actAdvance(500);
    expect(onContentChange).not.toHaveBeenCalled(); // no false dirty on open

    const nextScene = {
      type: "excalidraw",
      version: 2,
      source: "yishan",
      elements: [element("e1", "two")],
      appState: { viewBackgroundColor: "#00ff00", theme: "light", activeTool: { type: "arrow" } },
      files: { img1: fileData() },
    };
    rerender({ content: JSON.stringify(nextScene) });

    expect(api.updateScene).toHaveBeenCalledTimes(1);
    const updateCall = api.updateScene.mock.calls[0]?.[0];
    expect(updateCall?.elements).toEqual([element("e1", "two")]);
    // theme/activeTool must NOT be passed to updateScene (would clobber live UI state).
    expect(updateCall?.appState).toEqual({ viewBackgroundColor: "#00ff00" });
    expect(api.addFiles).toHaveBeenCalledWith([fileData()]);

    // The canvas onChange triggered by updateScene must not publish (equal serialization).
    act(() =>
      result.current.handleChange(
        [element("e1", "two")],
        { ...nextScene.appState, viewBackgroundColor: "#00ff00" },
        { img1: fileData() },
      ),
    );
    actAdvance(500);
    expect(onContentChange).not.toHaveBeenCalled();
    unmount();
  });

  it("does not re-apply content that matches the applied serialization (store echo)", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const { result, unmount, rerender } = renderHook(
      ({ content }) => useExcalidrawSceneSync({ content, onContentChange }),
      { initialProps: { content: sceneJson([element("e1", "one")]) } },
    );

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));

    // Simulate a user edit being echoed back through the store.
    act(() => result.current.handleChange([element("e1", "edited")], CANVAS_DEFAULT_APP_STATE, {}));
    actAdvance(500);
    expect(onContentChange).toHaveBeenCalledTimes(1);
    const published = onContentChange.mock.calls[0]?.[0] as string;
    expect(api.updateScene).not.toHaveBeenCalled();

    // Store echo: content prop becomes the published JSON → must be a no-op.
    rerender({ content: published });
    expect(api.updateScene).not.toHaveBeenCalled();
    expect(onContentChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("surfaces a parse error when no scene is applied yet", () => {
    const onContentChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useExcalidrawSceneSync({ content: "{not json", onContentChange }),
    );

    expect(result.current.parseError).toContain("Invalid Excalidraw JSON");
    // Canvas never mounted → initialData is the seeded empty scene, not a crash.
    expect(result.current.initialData.elements).toEqual([]);
    unmount();
  });

  it("recovers from a parse error when valid content arrives before the canvas mounts", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const { result, unmount, rerender } = renderHook(
      ({ content }) => useExcalidrawSceneSync({ content, onContentChange }),
      { initialProps: { content: "{not json" } },
    );

    expect(result.current.parseError).toContain("Invalid Excalidraw JSON");

    const valid = sceneJson([element("e1", "recovered")], { viewBackgroundColor: "#ffffff" });
    rerender({ content: valid });

    expect(result.current.parseError).toBeNull();
    // Canvas not mounted: scene goes to initialData, not updateScene.
    expect(result.current.initialData.elements).toEqual([element("e1", "recovered")]);

    // Canvas mounts now; its onChange must not publish (matches applied serialization).
    act(() => result.current.handleChange([element("e1", "recovered")], CANVAS_DEFAULT_APP_STATE, {}));
    actAdvance(500);
    expect(onContentChange).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps the canvas intact when content becomes corrupt after a scene was applied", () => {
    const onContentChange = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result, unmount, rerender } = renderHook(
      ({ content }) => useExcalidrawSceneSync({ content, onContentChange }),
      { initialProps: { content: sceneJson([element("e1", "one")]) } },
    );

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));

    rerender({ content: "{corrupt" });

    expect(result.current.parseError).toBeNull();
    expect(api.updateScene).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    unmount();
  });

  it("getSaveContent serializes the latest scene fresh, even mid-debounce", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const { result, unmount } = renderHook(() => useExcalidrawSceneSync({ content: "", onContentChange }));

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));
    act(() => result.current.handleChange([element("e1", "latest")], CANVAS_DEFAULT_APP_STATE, {}));

    // Debounce has NOT fired yet — save must still see the latest edit.
    const saveContent = result.current.getSaveContent();
    expect(JSON.parse(saveContent).elements).toEqual([element("e1", "latest")]);
    unmount();
  });

  it("flushes a pending publish on unmount so an edit inside the debounce window is not lost", () => {
    vi.useFakeTimers();
    const onContentChange = vi.fn();
    const { result, unmount } = renderHook(() => useExcalidrawSceneSync({ content: "", onContentChange }));

    const api = makeApi();
    act(() => result.current.onCanvasReady(api as unknown as ExcalidrawImperativeAPI));
    act(() => result.current.handleChange([element("e1", "last-second")], CANVAS_DEFAULT_APP_STATE, {}));

    unmount();
    expect(onContentChange).toHaveBeenCalledTimes(1);
  });
});

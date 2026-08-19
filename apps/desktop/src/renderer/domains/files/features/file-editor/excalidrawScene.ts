import { restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { getErrorMessage } from "@shared/helpers/errorHelpers";

/**
 * Return type for {@link parseExcalidrawScene}.
 *
 * `elements` and `files` match the shapes returned by `restore()`.
 * `appState` is a partial so callers can safely pass `{}` for the empty-input case.
 */
export type ParsedExcalidrawScene = {
  elements: readonly ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: BinaryFiles;
};

/** Transient appState keys that should never be persisted into a scene file. */
const TRANSIENT_APP_STATE_KEYS = new Set([
  "scrollX",
  "scrollY",
  "zoom",
  "selectedElementIds",
  "selectionElement",
  "editingGroupId",
  "editingTextElement",
  "editingLinearElement",
]);

/**
 * appState keys that are genuine scene content and should be applied to the
 * canvas on disk refresh. Mirrors the package's `export: true` storage config
 * (verified against @excalidraw/excalidraw 0.18.1): passing the full restored
 * appState to `updateScene` would clobber live UI state (theme, active tool).
 */
const SCENE_APP_STATE_KEYS = ["viewBackgroundColor", "gridSize", "gridStep", "gridModeEnabled"] as const;

/**
 * Parses a raw Excalidraw JSON string into a structured scene.
 *
 * - Empty or whitespace-only input returns `{ elements: [], appState: {}, files: {} }`.
 * - Malformed JSON, or JSON that is not an object with an `elements` array,
 *   throws a plain `Error` with a stable message prefix.
 * - Otherwise the JSON is parsed and then restored via the upstream `restore()`.
 */
export function parseExcalidrawScene(json: string): ParsedExcalidrawScene {
  const trimmed = json.trim();
  if (trimmed.length === 0) {
    return { elements: [], appState: {}, files: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause: unknown) {
    throw new Error(`Invalid Excalidraw JSON: ${getErrorMessage(cause)}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Excalidraw JSON: expected an object");
  }

  const data = parsed as Record<string, unknown>;
  if (!Array.isArray(data.elements)) {
    throw new Error("Invalid Excalidraw JSON: missing elements array");
  }

  // restore() expects Pick<ImportedDataState, "appState"|"elements"|"files">
  return restore(
    {
      appState: (data.appState as Record<string, unknown> | undefined) ?? undefined,
      elements: data.elements as readonly ExcalidrawElement[],
      files: (data.files as BinaryFiles | undefined) ?? undefined,
    },
    null,
    null,
  );
}

/**
 * Returns a shallow copy of `appState` with only transient canvas-viewport
 * and editing fields removed. Does **not** mutate the input.
 */
export function normalizeTransientAppState(appState: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(appState)) {
    if (!TRANSIENT_APP_STATE_KEYS.has(key)) {
      normalized[key] = appState[key];
    }
  }
  return normalized;
}

/**
 * Returns only the appState fields that are scene content and safe to apply
 * to a live canvas via `updateScene` (theme, tool state, and viewport must
 * stay untouched). Does **not** mutate the input.
 */
export function pickSceneAppState(appState: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of SCENE_APP_STATE_KEYS) {
    if (key in appState) {
      picked[key] = appState[key];
    }
  }
  return picked;
}

/**
 * Builds the canonical empty scene (restore-defaulted, matching what the
 * canvas produces on mount with an empty `initialData`), so its normalized
 * serialization can seed the applied-state comparison for empty files.
 */
export function createEmptyScene(): ParsedExcalidrawScene {
  const restored = restore({ elements: [], appState: {}, files: {} }, null, null);
  return {
    elements: restored.elements,
    appState: restored.appState as Record<string, unknown>,
    files: restored.files,
  };
}

/**
 * Serializes a scene into an Excalidraw JSON string suitable for saving as a
 * `.excalidraw` file.
 *
 * - Transient appState fields are stripped before serialization.
 * - The `source` field is NOT manipulated here: the upstream package writes
 *   `window.EXCALIDRAW_EXPORT_SOURCE` (set to "yishan" by the renderer's
 *   index.html inline script) into every export.
 * - Delegates to the upstream `serializeAsJSON()` with `type: "local"`.
 */
export function serializeExcalidrawScene(scene: ParsedExcalidrawScene): string {
  return serializeAsJSON(scene.elements, normalizeTransientAppState(scene.appState), scene.files, "local");
}

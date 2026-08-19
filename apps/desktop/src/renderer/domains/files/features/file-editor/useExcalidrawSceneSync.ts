import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CaptureUpdateActionType } from "@excalidraw/excalidraw/store";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { getErrorMessage } from "@shared/helpers/errorHelpers";
import { useCallback, useEffect, useRef, useState } from "react";
import { createEmptyScene, parseExcalidrawScene, pickSceneAppState, serializeExcalidrawScene } from "./excalidrawScene";
import type { ParsedExcalidrawScene } from "./excalidrawScene";

export type UseExcalidrawSceneSyncProps = {
  content: string;
  onContentChange: (json: string) => void;
};

export type UseExcalidrawSceneSyncReturn = {
  initialData: ParsedExcalidrawScene;
  parseError: string | null;
  handleChange: (elements: readonly ExcalidrawElement[], appState: Record<string, unknown>, files: BinaryFiles) => void;
  getSaveContent: () => string;
  onCanvasReady: (api: ExcalidrawImperativeAPI) => void;
};

type LatestSceneRef = {
  elements: readonly ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: BinaryFiles;
};

/** Computes the initial scene, its normalized serialization, and any parse error. */
function computeInitial(content: string): {
  scene: ParsedExcalidrawScene;
  serialization: string | null;
  error: string | null;
} {
  if (content.trim().length === 0) {
    // Seed from the restore-defaulted empty scene so the canvas's post-mount
    // onChange serializes to the same value (no false-dirty on open).
    const emptyScene = createEmptyScene();
    return { scene: emptyScene, serialization: serializeExcalidrawScene(emptyScene), error: null };
  }
  try {
    const scene = parseExcalidrawScene(content);
    return { scene, serialization: serializeExcalidrawScene(scene), error: null };
  } catch (err: unknown) {
    // Unparseable content at mount: keep appliedSerializationRef null so the
    // content effect treats this as "no applied scene" and shows the error
    // pane instead of a blank canvas.
    return { scene: createEmptyScene(), serialization: null, error: getErrorMessage(err) };
  }
}

const CAPTURE_NEVER = "NEVER" as CaptureUpdateActionType;

/**
 * Manages bidirectional state sync between an Excalidraw canvas and a JSON
 * string content source (e.g. a file tab).
 *
 * The hook handles:
 * - Initial scene loading via `initialData`
 * - Disk-refresh updates via `updateScene` / `addFiles` on the imperative API
 * - User edits debounced and published back to the content source
 * - Parse-error handling that never destroys in-progress user work
 */
export function useExcalidrawSceneSync({
  content,
  onContentChange,
}: UseExcalidrawSceneSyncProps): UseExcalidrawSceneSyncReturn {
  // ── Initial data for the canvas (updated until the canvas is mounted) ──
  const [{ scene: initialScene, serialization: initialSerialization, error: initialError }] = useState(() =>
    computeInitial(content),
  );
  const [canvasInitialData, setCanvasInitialData] = useState<ParsedExcalidrawScene>(() => initialScene);

  const appliedSerializationRef = useRef<string | null>(initialSerialization);
  const latestSceneRef = useRef<LatestSceneRef>({
    elements: initialScene.elements,
    appState: { ...initialScene.appState },
    files: { ...initialScene.files },
  });
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const [parseError, setParseError] = useState<string | null>(() => initialError);

  // ── Debounce machinery ──
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const publish = useCallback(() => {
    const latest = latestSceneRef.current;
    const json = serializeExcalidrawScene({
      elements: latest.elements,
      appState: latest.appState,
      files: latest.files,
    });
    if (json !== appliedSerializationRef.current) {
      appliedSerializationRef.current = json;
      onContentChangeRef.current(json);
    }
  }, []);

  // ── onChange handler: capture refs synchronously, debounce publish ──
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: Record<string, unknown>, files: BinaryFiles) => {
      latestSceneRef.current = { elements, appState, files };

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        publish();
      }, 250);
    },
    [publish],
  );

  // ── Clean up debounce timer on unmount, flushing any pending publish so an
  // ── edit made within the debounce window is not silently lost. ──
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        debounceTimerRef.current = null;
        publish();
      }
    };
  }, [publish]);

  // ── Content effect: handle external content changes (disk refresh, load) ──
  useEffect(() => {
    let parsed: ParsedExcalidrawScene;
    try {
      // Normalize empty content to the same restore-defaulted empty scene as
      // computeInitial, so its serialization matches the seeded applied state.
      parsed = content.trim().length === 0 ? createEmptyScene() : parseExcalidrawScene(content);
    } catch (err: unknown) {
      // If we've never applied a scene, surface the error.
      if (appliedSerializationRef.current === null) {
        setParseError(getErrorMessage(err));
      } else {
        // We have an active scene — log warning but keep canvas intact.
        console.warn("Excalidraw content parse error (keeping current scene):", getErrorMessage(err));
      }
      return;
    }

    // Clear any previous parse error.
    setParseError(null);

    const nextSerialization = serializeExcalidrawScene(parsed);

    // Same normalized content as what's applied — no-op.
    if (nextSerialization === appliedSerializationRef.current) {
      return;
    }

    // Apply updated content via the imperative API.
    // (Covers both initial-mount-with-blank-data and disk-refresh cases.)
    const api = excalidrawApiRef.current;
    if (api) {
      api.updateScene({
        elements: parsed.elements as Parameters<typeof api.updateScene>[0]["elements"],
        appState: pickSceneAppState(parsed.appState) as Parameters<typeof api.updateScene>[0]["appState"],
        captureUpdate: CAPTURE_NEVER,
      });
      const filesArray = Object.values(parsed.files);
      if (filesArray.length > 0) {
        api.addFiles(filesArray);
      }
    } else {
      // Canvas is not mounted yet (initial mount or recovery from a parse
      // error). It will mount with this scene via initialData — otherwise the
      // mount-time onChange would publish the stale empty scene and overwrite
      // the valid content.
      setCanvasInitialData(parsed);
    }

    appliedSerializationRef.current = nextSerialization;
    latestSceneRef.current = {
      elements: parsed.elements,
      appState: { ...parsed.appState },
      files: { ...parsed.files },
    };
  }, [content]);

  // ── Save content: serialize fresh (never stale debounce) ──
  const getSaveContent = useCallback((): string => {
    const latest = latestSceneRef.current;
    return serializeExcalidrawScene({
      elements: latest.elements,
      appState: latest.appState,
      files: latest.files,
    });
  }, []);

  // ── Canvas ready callback ──
  const onCanvasReady = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawApiRef.current = api;
  }, []);

  return {
    initialData: canvasInitialData,
    parseError,
    handleChange,
    getSaveContent,
    onCanvasReady,
  };
}

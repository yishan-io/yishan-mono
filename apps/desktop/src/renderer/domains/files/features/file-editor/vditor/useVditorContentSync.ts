import { type RefObject, useEffect } from "react";
import { shouldApplyExternalContent } from "./editorContentSync";
import type { VditorEditorHandle } from "./vditorEditor";

type UseVditorContentSyncInput = {
  content: string;
  isDeletedRef: RefObject<boolean>;
  handleRef: RefObject<VditorEditorHandle | null>;
  lastEmittedRef: RefObject<string>;
  latestContentRef: RefObject<string>;
};

/**
 * Applies external content changes to the Vditor editor only when they
 * genuinely differ from the last emitted markdown. `setValue` does not
 * re-fire the input callback, so the loop-guard is simple.
 */
export function useVditorContentSync({
  content,
  isDeletedRef,
  handleRef,
  lastEmittedRef,
  latestContentRef,
}: UseVditorContentSyncInput) {
  useEffect(() => {
    latestContentRef.current = content;

    const handle = handleRef.current;
    if (!handle) return;
    if (isDeletedRef.current) return;
    if (!shouldApplyExternalContent(lastEmittedRef.current, content)) return;

    handle.setValue(content);
    // setValue does NOT re-fire the input callback, but we reconcile
    // lastEmittedRef here for correct comparison on the next external change.
    lastEmittedRef.current = content;
  }, [content, handleRef, isDeletedRef, lastEmittedRef, latestContentRef]);
}

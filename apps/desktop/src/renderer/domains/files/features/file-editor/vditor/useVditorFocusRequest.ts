import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { type RefObject, useEffect } from "react";
import type { VditorEditorHandle } from "./vditorEditor";

type UseVditorFocusRequestInput = {
  focusRequestKey: number;
  handleRef: RefObject<VditorEditorHandle | null>;
  pendingFocusRef: RefObject<number>;
  lastFocusKeyRef: RefObject<number>;
};

/** Requests editor focus when the parent increments `focusRequestKey`. */
export function useVditorFocusRequest({
  focusRequestKey,
  handleRef,
  pendingFocusRef,
  lastFocusKeyRef,
}: UseVditorFocusRequestInput) {
  useEffect(() => {
    if (focusRequestKey <= 0) return;
    if (focusRequestKey === lastFocusKeyRef.current) return;
    lastFocusKeyRef.current = focusRequestKey;

    const handle = handleRef.current;
    if (!handle) {
      pendingFocusRef.current = focusRequestKey;
      return;
    }

    const frame = requestAnimationFrame(() => {
      try {
        handle.focus();
      } catch (error: unknown) {
        console.error("[VditorFileEditor] focus failed:", getErrorMessage(error));
      }
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusRequestKey, handleRef, lastFocusKeyRef, pendingFocusRef]);
}

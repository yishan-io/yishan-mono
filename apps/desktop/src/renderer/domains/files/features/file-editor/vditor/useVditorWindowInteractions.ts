import { type RefObject, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { attachMermaidZoomButtons } from "./mermaidZoomButton";

type UseVditorWindowInteractionsInput = {
  rootRef: RefObject<HTMLDivElement | null>;
  isDeletedRef: RefObject<boolean>;
  onZoomDiagramSvg: (svgContent: string) => void;
};

/**
 * Registers the Vditor window-level interactions:
 * - Select-all (Cmd/Ctrl+A) interception at the window capture phase —
 *   Chromium's native select-all in Vditor's IR contenteditable only selects
 *   the current block; the capture-phase handler selects the whole IR
 *   content so Vditor's copy handler converts the full markdown.
 * - Mermaid zoom expand buttons inside Vditor's rendered preview panels.
 */
export function useVditorWindowInteractions({
  rootRef,
  isDeletedRef,
  onZoomDiagramSvg,
}: UseVditorWindowInteractionsInput) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleSelectAll = (event: KeyboardEvent) => {
      if (isDeletedRef.current) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "a") return;

      const root = rootRef.current;
      if (!root) return;
      // Only act when the key originates inside this editor — don't hijack
      // Cmd+A while the file tree or other surfaces have focus.
      if (!(event.target instanceof Node) || !root.contains(event.target)) return;

      event.preventDefault();
      const pre = root.querySelector(".vditor-ir pre.vditor-reset");
      if (!pre) return;

      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    window.addEventListener("keydown", handleSelectAll, true);
    return () => {
      window.removeEventListener("keydown", handleSelectAll, true);
    };
  }, [isDeletedRef, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    return attachMermaidZoomButtons(root, onZoomDiagramSvg, {
      expandLabel: t("settings.appearance.markdown.expandDiagram"),
    });
  }, [onZoomDiagramSvg, rootRef, t]);
}

import type React from "react";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { MermaidBlock } from "./MermaidBlock";

type MermaidPortalProps = {
  targetId: string;
  code: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

/** Renders a MermaidBlock into a placeholder div found within the markdown container. */
export function MermaidPortal({ targetId, code, containerRef }: MermaidPortalProps) {
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const target = container.querySelector(`[data-mermaid-id="${targetId}"]`);
    if (!target) return;

    setPortalElement(target as HTMLDivElement);

    return () => {
      if (target instanceof HTMLDivElement) {
        target.innerHTML = "";
      }
      setPortalElement(null);
    };
  }, [targetId, containerRef]);

  if (!portalElement) return null;

  return ReactDOM.createPortal(<MermaidBlock code={code} />, portalElement);
}

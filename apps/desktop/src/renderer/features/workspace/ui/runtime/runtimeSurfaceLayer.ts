type RuntimeEntry = {
  element: HTMLElement;
  placeholder: HTMLElement | null;
  resizeObserver: ResizeObserver | null;
};

function applyElementRect(element: HTMLElement, placeholder: HTMLElement): void {
  const rect = placeholder.getBoundingClientRect();
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
  const hasArea = rect.width > 1 && rect.height > 1;
  element.style.visibility = hasArea ? "visible" : "hidden";
  element.style.pointerEvents = hasArea ? "auto" : "none";
}

export function createFixedRuntimeLayer(rootTestId: string) {
  let rootHost: HTMLDivElement | null = null;
  const entries = new Map<string, RuntimeEntry>();

  const ensureRootHost = (): HTMLDivElement => {
    if (rootHost?.isConnected) {
      return rootHost;
    }

    // Recover from HMR: reuse existing DOM node instead of creating a duplicate.
    const runtimeRoot = getOrCreateRuntimeRoot();
    const existing = runtimeRoot.querySelector<HTMLDivElement>(`[data-testid="${rootTestId}"]`);
    if (existing) {
      existing.style.zIndex = "1";
      rootHost = existing;
      return existing;
    }

    const host = document.createElement("div");
    host.setAttribute("data-testid", rootTestId);
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.pointerEvents = "none";
    host.style.zIndex = "1";
    runtimeRoot.appendChild(host);
    rootHost = host;
    return host;
  };

  const register = (id: string, element: HTMLElement): void => {
    if (entries.has(id)) {
      return;
    }
    ensureRootHost().appendChild(element);
    entries.set(id, {
      element,
      placeholder: null,
      resizeObserver: null,
    });
  };

  const attach = (id: string, placeholder: HTMLElement): void => {
    const entry = entries.get(id);
    if (!entry) {
      return;
    }

    entry.resizeObserver?.disconnect();
    entry.placeholder = placeholder;
    const resizeObserver = new ResizeObserver(() => {
      applyElementRect(entry.element, placeholder);
    });
    resizeObserver.observe(placeholder);
    entry.resizeObserver = resizeObserver;
    applyElementRect(entry.element, placeholder);
  };

  const detach = (id: string, placeholder: HTMLElement): void => {
    const entry = entries.get(id);
    if (!entry || entry.placeholder !== placeholder) {
      return;
    }

    entry.placeholder = null;
    entry.resizeObserver?.disconnect();
    entry.resizeObserver = null;
  };

  const remove = (id: string): void => {
    const entry = entries.get(id);
    if (!entry) {
      return;
    }

    entry.resizeObserver?.disconnect();
    entry.element.remove();
    entries.delete(id);

    if (entries.size === 0 && rootHost) {
      rootHost.remove();
      rootHost = null;
    }
  };

  const refresh = (id: string): void => {
    const entry = entries.get(id);
    if (!entry?.placeholder) {
      return;
    }
    applyElementRect(entry.element, entry.placeholder);
  };

  return {
    register,
    attach,
    detach,
    remove,
    refresh,
  };
}
import { getOrCreateRuntimeRoot } from "./runtimeRoot";

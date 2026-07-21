/**
 * Off-main-thread mermaid rendering service using a hidden iframe.
 *
 * Mermaid's layout engine (dagre/elk) is CPU-intensive and blocks the main thread.
 * This service creates one hidden iframe, posts diagram code to it via postMessage,
 * and receives rendered SVG strings back — keeping the main thread free.
 *
 * The iframe loads mermaid from CDN as an ES module. This avoids bundling the 3MB
 * mermaid library twice and works reliably in Electron's renderer process.
 *
 * Usage:
 *   const svg = await mermaidIframeRenderer.render(code, { isDark, fontFamily });
 */

type MermaidRenderRequest = {
  id: string;
  code: string;
  isDark: boolean;
  fontFamily: string;
};

type MermaidRenderResponse = {
  id: string;
  svg?: string;
  error?: string;
  type?: string;
};

type PendingRender = {
  resolve: (svg: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const RENDER_TIMEOUT_MS = 15_000;
const MERMAID_CDN_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

/**
 * Inline HTML document for the hidden mermaid rendering iframe.
 * Loads mermaid as an ES module, listens for render requests via postMessage,
 * and posts SVG results back to the parent window.
 */
function buildIframeHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><style>body{margin:0;padding:0;background:transparent;}</style></head>
<body>
<script type="module">
import mermaid from "${MERMAID_CDN_URL}";

let lastThemeKey = null;

function initTheme(isDark, fontFamily) {
  const key = isDark ? "dark" : "light";
  if (key === lastThemeKey) return;
  lastThemeKey = key;

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    themeVariables: isDark
      ? {
          primaryColor: "#3f51b5",
          primaryTextColor: "#e0e0e0",
          primaryBorderColor: "#5c6bc0",
          lineColor: "#7986cb",
          secondaryColor: "#1a237e",
          tertiaryColor: "#283593",
          background: "#121212",
          mainBkg: "#1e1e1e",
          nodeBorder: "#5c6bc0",
          clusterBkg: "#1a1a2e",
          titleColor: "#e0e0e0",
          edgeLabelBackground: "#2d2d2d",
        }
      : undefined,
    fontFamily: fontFamily || "sans-serif",
    fontSize: 14,
  });
}

window.addEventListener("message", async (event) => {
  const req = event.data;
  if (!req || typeof req.id !== "string" || typeof req.code !== "string") return;

  initTheme(req.isDark, req.fontFamily);

  const diagId = "mermaid-ifr-" + req.id.replace(/[^a-zA-Z0-9-]/g, "") + "-" + Date.now();

  try {
    const { svg } = await mermaid.render(diagId, req.code);
    window.parent.postMessage({ id: req.id, svg }, "*");
  } catch (err) {
    const el = document.getElementById("d" + diagId);
    if (el) el.remove();
    window.parent.postMessage({
      id: req.id,
      error: err instanceof Error ? err.message : String(err),
    }, "*");
  }
});

window.parent.postMessage({ type: "mermaid-iframe-ready" }, "*");
<\/script>
</body>
</html>`;
}

class MermaidIframeRenderer {
  private iframe: HTMLIFrameElement | null = null;
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private pendingRenders = new Map<string, PendingRender>();
  private nextId = 0;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  /** Ensures the hidden iframe is created and ready to accept render requests. */
  private ensureIframe(): Promise<void> {
    if (this.ready) {
      return Promise.resolve();
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-10000px";
      iframe.style.top = "-10000px";
      iframe.style.width = "800px";
      iframe.style.height = "600px";
      iframe.style.border = "none";
      iframe.style.visibility = "hidden";
      iframe.style.pointerEvents = "none";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("data-testid", "mermaid-render-iframe");

      this.messageHandler = (event: MessageEvent) => {
        const data = event.data as MermaidRenderResponse | undefined;
        if (!data) return;

        // Ready signal from iframe
        if (data.type === "mermaid-iframe-ready") {
          this.ready = true;
          resolve();
          return;
        }

        // Render response
        if (data.id && this.pendingRenders.has(data.id)) {
          const pending = this.pendingRenders.get(data.id);
          if (!pending) {
            return;
          }
          this.pendingRenders.delete(data.id);
          clearTimeout(pending.timer);

          if (data.error) {
            pending.reject(new Error(data.error));
          } else if (data.svg) {
            pending.resolve(data.svg);
          } else {
            pending.reject(new Error("Empty mermaid render response"));
          }
        }
      };

      window.addEventListener("message", this.messageHandler);

      // Use srcdoc to avoid blob URL issues with Electron's CSP in some configurations.
      iframe.srcdoc = buildIframeHtml();
      document.body.appendChild(iframe);
      this.iframe = iframe;
    });

    return this.readyPromise;
  }

  /**
   * Renders a mermaid diagram in the hidden iframe and returns the SVG string.
   * The main thread is not blocked during rendering.
   */
  async render(code: string, options: { isDark: boolean; fontFamily: string }): Promise<string> {
    await this.ensureIframe();

    const id = `mr-${++this.nextId}`;
    const request: MermaidRenderRequest = {
      id,
      code,
      isDark: options.isDark,
      fontFamily: options.fontFamily,
    };

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRenders.has(id)) {
          this.pendingRenders.delete(id);
          reject(new Error(`Mermaid render timed out after ${RENDER_TIMEOUT_MS}ms`));
        }
      }, RENDER_TIMEOUT_MS);

      this.pendingRenders.set(id, { resolve, reject, timer });
      this.iframe?.contentWindow?.postMessage(request, "*");
    });
  }

  /** Destroys the iframe and cleans up all resources. */
  dispose(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }

    for (const pending of this.pendingRenders.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Mermaid iframe renderer disposed"));
    }
    this.pendingRenders.clear();

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    this.ready = false;
    this.readyPromise = null;
  }
}

/**
 * Shared singleton renderer instance. Lazily creates the iframe on first render request.
 * Reuses existing instance across HMR reloads to prevent iframe accumulation in dev mode.
 */
const GLOBAL_KEY = "__mermaidIframeRenderer__" as const;

function getOrCreateRenderer(): MermaidIframeRenderer {
  const global = globalThis as unknown as Record<string, MermaidIframeRenderer | undefined>;
  if (global[GLOBAL_KEY]) {
    return global[GLOBAL_KEY];
  }
  const instance = new MermaidIframeRenderer();
  global[GLOBAL_KEY] = instance;
  return instance;
}

export const mermaidIframeRenderer = getOrCreateRenderer();

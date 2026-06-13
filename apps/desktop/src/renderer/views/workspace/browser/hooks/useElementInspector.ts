import { useCallback, useEffect, useRef, useState } from "react";
import { writeClipboardText } from "../../../../commands/fileCommands";

const INSPECT_MESSAGE_TYPE = "yishan-inspect-element";

const INSPECT_SCRIPT = `
(function() {
  if (window.__yishanInspectActive) return;
  window.__yishanInspectActive = true;

  var style = document.createElement('style');
  style.id = '__yishan-inspect-style';
  style.textContent = [
    '* { cursor: crosshair !important; }',
    '.__yishan-inspect-hover {',
    '  outline: 2px solid #4285f4 !important;',
    '  background-color: rgba(66, 133, 244, 0.1) !important;',
    '}',
  ].join('\\n');
  document.head.appendChild(style);

  var lastElement = null;

  function getXPath(element) {
    var parts = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      var tagName = element.nodeName.toLowerCase();
      if (element.id) {
        parts.unshift(tagName + '[@id="' + element.id + '"]');
        break;
      }
      var index = 1;
      var sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.nodeName === element.nodeName) index++;
        sibling = sibling.previousElementSibling;
      }
      var hasFollowing = false;
      sibling = element.nextElementSibling;
      while (sibling) {
        if (sibling.nodeName === element.nodeName) { hasFollowing = true; break; }
        sibling = sibling.nextElementSibling;
      }
      parts.unshift(tagName + ((index > 1 || hasFollowing) ? '[' + index + ']' : ''));
      element = element.parentNode;
    }
    return '/' + parts.join('/');
  }

  function onMouseOver(e) {
    e.stopPropagation();
    if (lastElement) lastElement.classList.remove('__yishan-inspect-hover');
    var el = e.target;
    if (!el || el === document.documentElement || el === document.body) return;
    lastElement = el;
    el.classList.add('__yishan-inspect-hover');
  }

  function onClick(e) {
    e.stopPropagation();
    e.preventDefault();
    var el = e.target;
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var xpath = getXPath(el);
    console.log(JSON.stringify({
      type: "${INSPECT_MESSAGE_TYPE}",
      xpath: xpath,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    }));
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  function cleanup() {
    window.__yishanInspectActive = false;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (lastElement) lastElement.classList.remove('__yishan-inspect-hover');
    var s = document.getElementById('__yishan-inspect-style');
    if (s) s.remove();
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  window.__yishanStopInspect = cleanup;
})();
`;

const STOP_SCRIPT = `
(function() {
  if (window.__yishanStopInspect) {
    window.__yishanStopInspect();
    window.__yishanStopInspect = undefined;
  }
})();
`;

const TOAST_SCRIPT = `
(function() {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2e7d32;color:#fff;padding:8px 20px;border-radius:8px;font-size:13px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:none;user-select:none;white-space:nowrap;';
  toast.textContent = 'Copied XPath and rect to clipboard';
  document.body.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
})();
`;

export function useElementInspector(webviewRef: React.RefObject<Electron.WebviewTag | null>) {
  const [inspecting, setInspecting] = useState(false);
  const inspectingRef = useRef(false);
  const stopInspectingRef = useRef<(() => void) | null>(null);
  const consoleHandlerRef = useRef<((e: Event) => void) | null>(null);
  const boundWebviewRef = useRef<Electron.WebviewTag | null>(null);

  const startInspecting = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    inspectingRef.current = true;
    setInspecting(true);

    const handler = (e: Event) => {
      try {
        const msg = (e as { message?: string }).message;
        if (!msg) return;
        const data = JSON.parse(msg);
        if (data.type !== INSPECT_MESSAGE_TYPE || !data.xpath || !data.rect) return;
        const { xpath, rect } = data as {
          xpath: string;
          rect: { left: number; top: number; width: number; height: number };
        };

        const clipboardText = JSON.stringify({ xpath, rect });
        writeClipboardText(clipboardText).catch(() => {});
        const wv = webviewRef.current ?? boundWebviewRef.current;
        if (wv) {
          wv.executeJavaScript(TOAST_SCRIPT).catch(() => {});
        }
        stopInspectingRef.current?.();
      } catch {
        // Not a JSON inspect message; ignore.
      }
    };

    consoleHandlerRef.current = handler;
    boundWebviewRef.current = webview;
    webview.addEventListener("console-message", handler);
    webview.executeJavaScript(INSPECT_SCRIPT).catch(() => {});
  }, [webviewRef]);

  const stopInspecting = useCallback(() => {
    const webview = webviewRef.current ?? boundWebviewRef.current;
    if (webview) {
      webview.executeJavaScript(STOP_SCRIPT).catch(() => {});
      if (consoleHandlerRef.current) {
        webview.removeEventListener("console-message", consoleHandlerRef.current);
      }
    }
    consoleHandlerRef.current = null;
    boundWebviewRef.current = null;
    inspectingRef.current = false;
    setInspecting(false);
  }, [webviewRef]);

  const toggleInspecting = useCallback(() => {
    if (inspectingRef.current) {
      stopInspecting();
    } else {
      startInspecting();
    }
  }, [startInspecting, stopInspecting]);

  stopInspectingRef.current = stopInspecting;

  useEffect(() => {
    return () => {
      const webview = webviewRef.current ?? boundWebviewRef.current;
      if (webview && consoleHandlerRef.current) {
        webview.removeEventListener("console-message", consoleHandlerRef.current);
      }
    };
  }, [webviewRef]);

  return { inspecting, toggleInspecting, startInspecting, stopInspecting };
}

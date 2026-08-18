import { useCallback, useMemo, useState } from "react";
import { normalizeUrl } from "../normalizeUrl";

export function useBrowserUrl(initialUrl: string) {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [activeUrl, setActiveUrl] = useState(initialUrl);
  const [urlFocused, setUrlFocused] = useState(false);
  const [pageTitle, setPageTitle] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const displayUrl = useMemo(() => {
    if (urlFocused) {
      return urlInput;
    }
    if (!urlInput.trim()) {
      return "";
    }
    const normalized = normalizeUrl(urlInput);
    if (!pageTitle) {
      return normalized;
    }
    try {
      const url = new URL(normalized);
      return `${pageTitle} — ${url.host}`;
    } catch {
      return normalized;
    }
  }, [urlFocused, urlInput, pageTitle]);

  const normalizedUrl = urlInput.trim() ? normalizeUrl(urlInput) : "";
  const isHttps = normalizedUrl.startsWith("https://");
  const isHttp = normalizedUrl.startsWith("http://") && !isHttps;
  const resolvedUrl = useMemo(() => normalizeUrl(activeUrl), [activeUrl]);

  const handleUrlFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    setUrlFocused(true);
    setHighlightIndex(-1);
    requestAnimationFrame(() => {
      event.target.select();
    });
  }, []);

  const handleUrlBlur = useCallback(() => {
    setTimeout(() => {
      setUrlFocused(false);
      const normalized = normalizeUrl(urlInput);
      if (normalized) {
        setUrlInput(normalized);
      }
    }, 150);
  }, [urlInput]);

  const resetForNavigation = useCallback(() => {
    setPageTitle("");
    setUrlFocused(false);
  }, []);

  return {
    urlInput,
    setUrlInput,
    activeUrl,
    setActiveUrl,
    urlFocused,
    setUrlFocused,
    pageTitle,
    setPageTitle,
    highlightIndex,
    setHighlightIndex,
    displayUrl,
    normalizedUrl,
    isHttps,
    isHttp,
    resolvedUrl,
    handleUrlFocus,
    handleUrlBlur,
    resetForNavigation,
  };
}

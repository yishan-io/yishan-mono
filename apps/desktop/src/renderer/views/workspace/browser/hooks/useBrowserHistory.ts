import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrowserHistoryGroup } from "../../../../../main/ipc";
import { useCommands } from "../../../../hooks/useCommands";

export function useBrowserHistory() {
  const cmd = useCommands();
  const [historyGroups, setHistoryGroups] = useState<BrowserHistoryGroup[]>([]);

  useEffect(() => {
    void cmd.loadBrowserHistory().then(setHistoryGroups);
  }, [cmd]);

  const addHistoryEntry = useCallback(
    (url: string, title: string, faviconUrl?: string) => {
      if (!url.trim()) {
        return;
      }
      const entry = { url, title: title || url, faviconUrl, visitedAt: new Date().toISOString() };
      void cmd.appendBrowserHistory({ entry });
      setHistoryGroups((prev) => {
        let host: string;
        try {
          host = new URL(url).host;
        } catch {
          host = url;
        }
        const next = prev.map((g) => ({ ...g, entries: [...g.entries] }));
        let group = next.find((g) => g.host === host);
        if (!group) {
          group = { host, faviconUrl, entries: [] };
          next.unshift(group);
        }
        if (faviconUrl) {
          group.faviconUrl = faviconUrl;
        }
        const existing = group.entries.find((entry) => entry.url === url);
        if (existing) {
          existing.title = title || existing.title;
          existing.faviconUrl = faviconUrl || existing.faviconUrl;
          existing.visitedAt = entry.visitedAt;
        } else {
          group.entries.push(entry);
        }
        return next;
      });
    },
    [cmd],
  );

  const filterHistory = useCallback(
    (urlInput: string, urlFocused: boolean) => {
      const allEntries = historyGroups.flatMap((g) => g.entries);
      if (!urlFocused || !urlInput.trim()) {
        return allEntries.slice().reverse();
      }
      const lower = urlInput.toLowerCase();
      return allEntries
        .filter((entry) => entry.url.toLowerCase().includes(lower) || entry.title.toLowerCase().includes(lower))
        .reverse();
    },
    [historyGroups],
  );

  return { historyGroups, addHistoryEntry, filterHistory };
}

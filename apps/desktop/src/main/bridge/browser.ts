export type BrowserHistoryEntry = {
  url: string;
  title: string;
  faviconUrl?: string;
  visitedAt: string;
};

export type BrowserHistoryGroup = {
  host: string;
  faviconUrl?: string;
  entries: BrowserHistoryEntry[];
};

export type LoadBrowserHistoryResult = BrowserHistoryGroup[];

export type AppendBrowserHistoryInput = {
  entry: BrowserHistoryEntry;
};

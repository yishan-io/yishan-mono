export type RichComposerSlashCommand = {
  id: string;
  category: "skill" | "agent";
  title: string;
  description?: string;
  insertText?: string;
  searchText?: string;
};

/** One file or folder suggested by the composer file mention search. */
export type FileMentionResult = {
  path: string;
  highlightedPathIndexes: number[];
  isDirectory?: boolean;
};

/** A composer token range (slash command or file mention) that triggers an autocomplete menu. */
export type ComposerTokenRange = {
  start: number;
  end: number;
  query: string;
};

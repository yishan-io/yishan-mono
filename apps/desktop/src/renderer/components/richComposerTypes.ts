export type RichComposerSlashCommand = {
  id: string;
  category: "skill" | "agent";
  title: string;
  description?: string;
  insertText?: string;
  searchText?: string;
};

export type SlashCommandRange = {
  start: number;
  end: number;
  query: string;
};

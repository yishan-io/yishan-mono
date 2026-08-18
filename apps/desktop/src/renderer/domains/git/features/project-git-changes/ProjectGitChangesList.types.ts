export type ProjectGitChangeKind = "added" | "modified" | "deleted" | "renamed" | "untracked";

export type ProjectGitChangeItem = {
  path: string;
  kind: ProjectGitChangeKind;
  additions: number;
  deletions: number;
};

export type ProjectGitChangesSection = {
  id: string;
  label: string;
  files: ProjectGitChangeItem[];
};

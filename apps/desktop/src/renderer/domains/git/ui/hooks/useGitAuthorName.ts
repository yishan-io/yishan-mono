import { useEffect, useState } from "react";
import { useGitCommands } from "../../../../app/commands/useCommands";
import { selectWorkspaces } from "../../../../domains/workspace/state/workspaceSelectors";

/**
 * Fetches the git author name for the given workspace path.
 * Returns an empty string while loading or when no path is provided.
 * Uses a cancellation guard to avoid stale state updates on unmount or
 * dependency change.
 */
export function useGitAuthorName(worktreePath: string): string {
  const { getGitAuthorName } = useGitCommands();
  const [resolvedGitUserName, setResolvedGitUserName] = useState("");

  useEffect(() => {
    if (!worktreePath) {
      setResolvedGitUserName("");
      return;
    }

    let isCancelled = false;
    void (async () => {
      try {
        const workspaceId = selectWorkspaces().find((workspace) => workspace.worktreePath?.trim() === worktreePath)?.id;
        if (!workspaceId) {
          if (!isCancelled) {
            setResolvedGitUserName("");
          }
          return;
        }
        const authorName = await getGitAuthorName({ workspaceId });
        if (isCancelled) return;
        setResolvedGitUserName(authorName?.trim() || "");
      } catch {
        if (!isCancelled) {
          setResolvedGitUserName("");
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [getGitAuthorName, worktreePath]);

  return resolvedGitUserName;
}

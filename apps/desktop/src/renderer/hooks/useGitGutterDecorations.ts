import { useEffect, useRef, useState } from "react";
import { readDiff } from "../commands/gitCommands";
import {
  type GitLineChange,
  type GitLineChangeKind,
  computeGitLineChanges,
  getHunkForLine,
} from "../helpers/gitGutterDiff";
import { monaco } from "../helpers/monacoSetup";

// CSS class names injected for gutter decorations.
// These are defined in style.css and matched by Monaco's margin decoration class mechanism.
const GUTTER_ADDED_CLASS = "git-gutter-added";
const GUTTER_MODIFIED_CLASS = "git-gutter-modified";
const GUTTER_DELETED_CLASS = "git-gutter-deleted";
const GIT_GUTTER_DIFF_DEBOUNCE_MS = 150;
const MAX_LIVE_GUTTER_DIFF_LINES = 5000;

export type UseGitGutterDecorationsInput = {
  /** Monaco editor instance to decorate. */
  editor: monaco.editor.IStandaloneCodeEditor | null;
  /** Workspace identity used for daemon diff lookup. */
  workspaceId?: string;
  /** Relative path of the file being edited. */
  path: string;
  /** Workspace worktree path (used to fetch the git HEAD content). */
  worktreePath?: string;
  /** Current editor content (tracks real-time edits). */
  currentContent: string;
};

/**
 * Fetches the git HEAD version of the file and applies line-level gutter
 * decorations (added/modified/deleted) to the Monaco editor. Decorations
 * are updated whenever the editor content changes. Clicking a gutter
 * decoration shows an inline diff view zone.
 */
export function useGitGutterDecorations({
  editor,
  workspaceId,
  path,
  worktreePath,
  currentContent,
}: UseGitGutterDecorationsInput): void {
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const [headContent, setHeadContent] = useState<string | null>(null);
  const [shouldSkipDecorations, setShouldSkipDecorations] = useState(false);
  const pendingRequestRef = useRef(0);
  const changesRef = useRef<GitLineChange[]>([]);
  const viewZoneRef = useRef<{ zoneId: string; afterLineNumber: number } | null>(null);
  const viewZoneDomRef = useRef<HTMLDivElement | null>(null);

  // Fetch the HEAD content when path or worktreePath changes.
  useEffect(() => {
    if (!workspaceId || !worktreePath || !path) {
      setHeadContent(null);
      setShouldSkipDecorations(false);
      return;
    }

    const requestId = ++pendingRequestRef.current;

    readDiff({ workspaceId, relativePath: path })
      .then((result) => {
        if (pendingRequestRef.current !== requestId) return;
        setShouldSkipDecorations(Boolean(result.shouldSkipDecorations));
        setHeadContent(result.shouldSkipDecorations ? null : result.oldContent);
      })
      .catch(() => {
        if (pendingRequestRef.current !== requestId) return;
        setShouldSkipDecorations(false);
        setHeadContent(null);
      });

    return () => {
      pendingRequestRef.current++;
    };
  }, [path, workspaceId, worktreePath]);

  const shouldThrottleLiveDiff = currentContent.split("\n").length > MAX_LIVE_GUTTER_DIFF_LINES;

  // Compute and apply decorations whenever content or HEAD changes.
  useEffect(() => {
    if (!editor) return;

    if (headContent === null || shouldSkipDecorations) {
      changesRef.current = [];
      if (decorationsRef.current) {
        decorationsRef.current.clear();
      }
      return;
    }

    const applyChanges = () => {
      const changes = computeGitLineChanges(headContent, currentContent);
      changesRef.current = changes;
      const decorations = changesToDecorations(changes);

      if (decorationsRef.current) {
        decorationsRef.current.set(decorations);
      } else {
        decorationsRef.current = editor.createDecorationsCollection(decorations);
      }
    };

    if (shouldThrottleLiveDiff) {
      const timeout = window.setTimeout(applyChanges, GIT_GUTTER_DIFF_DEBOUNCE_MS);
      return () => {
        window.clearTimeout(timeout);
      };
    }

    applyChanges();
  }, [editor, currentContent, headContent, shouldSkipDecorations, shouldThrottleLiveDiff]);

  // Register gutter click handler for showing inline diff.
  useEffect(() => {
    if (!editor) return;

    const mouseDisposable = editor.onMouseDown((event) => {
      const targetType = event.target.type;

      // Clicking on the ViewZone itself dismisses it
      if (targetType === monaco.editor.MouseTargetType.CONTENT_VIEW_ZONE) {
        if (viewZoneRef.current) {
          removeViewZone(editor, viewZoneRef);
          return;
        }
      }

      // Only handle clicks on line decorations in the gutter
      if (targetType !== monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) {
        return;
      }

      const lineNumber = event.target.position?.lineNumber;
      if (!lineNumber) return;

      // Check if this line has a git change decoration
      const change = changesRef.current.find((c) => c.lineNumber === lineNumber);
      if (!change) return;

      // Toggle: if clicking the same line that already has a viewzone, remove it
      if (viewZoneRef.current && viewZoneRef.current.afterLineNumber === lineNumber) {
        removeViewZone(editor, viewZoneRef);
        return;
      }

      // Remove existing viewzone if any
      if (viewZoneRef.current) {
        removeViewZone(editor, viewZoneRef);
      }

      // Get the hunk context for this line
      if (headContent === null) return;
      const hunkInfo = getHunkForLine(headContent, currentContent, lineNumber);
      if (!hunkInfo) return;

      // Determine where to place the viewzone (above the changed lines)
      const afterLine = hunkInfo.hunk.newStart - 1;

      // Create the viewzone DOM
      const domNode = createInlineDiffDom(hunkInfo.oldLines, hunkInfo.newLines, change.kind);
      viewZoneDomRef.current = domNode;

      // Compute height: header (~30px) + each line (~18px) + padding (20px)
      const LINE_HEIGHT_PX = 18;
      const HEADER_HEIGHT_PX = 30;
      const PADDING_PX = 20;
      let totalLines = hunkInfo.oldLines.length;
      if (change.kind === "modified") {
        totalLines += hunkInfo.newLines.length;
      }
      totalLines = Math.max(totalLines, 1);
      const heightInPx = HEADER_HEIGHT_PX + totalLines * LINE_HEIGHT_PX + PADDING_PX;

      editor.changeViewZones((accessor) => {
        const zoneId = accessor.addZone({
          afterLineNumber: afterLine,
          heightInPx,
          domNode,
          suppressMouseDown: false,
        });
        viewZoneRef.current = { zoneId, afterLineNumber: lineNumber };
      });
    });

    // Escape key dismisses the viewzone
    const keyDisposable = editor.onKeyDown((event) => {
      if (event.keyCode === monaco.KeyCode.Escape && viewZoneRef.current) {
        removeViewZone(editor, viewZoneRef);
      }
    });

    return () => {
      mouseDisposable.dispose();
      keyDisposable.dispose();
    };
  }, [editor, headContent, currentContent]);

  // Clean up viewzone and decorations on unmount or when head/path changes.
  useEffect(() => {
    return () => {
      if (editor && viewZoneRef.current) {
        removeViewZone(editor, viewZoneRef);
      }
    };
  }, [editor]);

  // Clean up decorations on unmount.
  useEffect(() => {
    return () => {
      if (decorationsRef.current) {
        decorationsRef.current.clear();
        decorationsRef.current = null;
      }
    };
  }, []);
}

// ─── ViewZone helpers ────────────────────────────────────────────────────────

function removeViewZone(
  editor: monaco.editor.IStandaloneCodeEditor,
  viewZoneRef: React.MutableRefObject<{ zoneId: string; afterLineNumber: number } | null>,
) {
  if (!viewZoneRef.current) return;
  const { zoneId } = viewZoneRef.current;
  editor.changeViewZones((accessor) => {
    accessor.removeZone(zoneId);
  });
  viewZoneRef.current = null;
}

/**
 * Creates a DOM element for the inline diff viewzone showing the old/new lines.
 * Dismissal is handled via click-on-zone or Escape key (not via a DOM button,
 * since Monaco's scroll overlay intercepts clicks on ViewZone content).
 */
function createInlineDiffDom(oldLines: string[], newLines: string[], kind: GitLineChangeKind): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "git-inline-diff-zone";

  // Header with change type and dismiss hint
  const header = document.createElement("div");
  header.className = "git-inline-diff-header";

  const label = document.createElement("span");
  label.className = "git-inline-diff-label";
  label.textContent = kind === "deleted" ? "Deleted" : kind === "added" ? "Added" : "Modified";
  header.appendChild(label);

  const hint = document.createElement("span");
  hint.className = "git-inline-diff-hint";
  hint.textContent = "Click to dismiss \u00b7 Esc";
  header.appendChild(hint);

  container.appendChild(header);

  // Content: show old lines (removed) in red
  const content = document.createElement("div");
  content.className = "git-inline-diff-content";

  if (oldLines.length > 0) {
    for (const line of oldLines) {
      const lineEl = document.createElement("div");
      lineEl.className = "git-inline-diff-line-old";
      lineEl.textContent = `- ${line}`;
      content.appendChild(lineEl);
    }
  }

  // For modifications, also show the new lines in green for context
  if (kind === "modified" && newLines.length > 0) {
    for (const line of newLines) {
      const lineEl = document.createElement("div");
      lineEl.className = "git-inline-diff-line-new";
      lineEl.textContent = `+ ${line}`;
      content.appendChild(lineEl);
    }
  }

  container.appendChild(content);
  return container;
}

// ─── Decoration helpers ──────────────────────────────────────────────────────

/**
 * Converts computed line changes to Monaco model decoration options.
 */
function changesToDecorations(changes: GitLineChange[]): monaco.editor.IModelDeltaDecoration[] {
  return changes.map((change) => {
    const className = getGutterClassName(change.kind);

    if (change.kind === "deleted") {
      return {
        range: {
          startLineNumber: change.lineNumber,
          startColumn: 1,
          endLineNumber: change.lineNumber,
          endColumn: 1,
        },
        options: {
          isWholeLine: false,
          linesDecorationsClassName: className,
        },
      };
    }

    return {
      range: {
        startLineNumber: change.lineNumber,
        startColumn: 1,
        endLineNumber: change.lineNumber,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: className,
      },
    };
  });
}

function getGutterClassName(kind: GitLineChange["kind"]): string {
  switch (kind) {
    case "added":
      return GUTTER_ADDED_CLASS;
    case "modified":
      return GUTTER_MODIFIED_CLASS;
    case "deleted":
      return GUTTER_DELETED_CLASS;
  }
}

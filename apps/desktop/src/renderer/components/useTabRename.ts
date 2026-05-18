import { useEffect, useRef, useState } from "react";

type WorkspaceTab = {
  id: string;
  title: string;
  pinned: boolean;
};

type UseTabRenameOptions = {
  selectedTabId: string;
  untitledLabel: string;
  onSelectTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
};

/**
 * Manages inline tab rename state (editing tab id, draft content, commit/cancel
 * helpers, and auto-select-all on rename start).
 */
export function useTabRename({ selectedTabId, untitledLabel, onSelectTab, onRenameTab }: UseTabRenameOptions) {
  const [editingTabId, setEditingTabId] = useState("");
  const editingRef = useRef<HTMLDivElement | null>(null);
  const editingDraftRef = useRef("");
  const renameCancelledRef = useRef(false);

  // Auto-focus and select all text when an edit starts.
  useEffect(() => {
    if (!editingTabId || !editingRef.current) {
      return;
    }

    const editable = editingRef.current;
    editable.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    editable.textContent = editingDraftRef.current;
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editingTabId]);

  const beginRename = (tab: WorkspaceTab) => {
    setEditingTabId(tab.id);
    editingDraftRef.current = tab.title || untitledLabel;
    if (tab.id !== selectedTabId) {
      onSelectTab(tab.id);
    }
  };

  const commitRename = (tab: WorkspaceTab) => {
    const nextTitle = editingDraftRef.current.trim();
    if (nextTitle && nextTitle !== tab.title) {
      onRenameTab(tab.id, nextTitle);
    }
    renameCancelledRef.current = true;
    setEditingTabId("");
    editingDraftRef.current = "";
  };

  const cancelRename = () => {
    renameCancelledRef.current = true;
    setEditingTabId("");
    editingDraftRef.current = "";
  };

  const handleRenameBlur = (tab: WorkspaceTab) => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }
    commitRename(tab);
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const selection = window.getSelection();
      if (!selection) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(event.currentTarget);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(tab);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  return {
    editingTabId,
    editingRef,
    editingDraftRef,
    beginRename,
    commitRename,
    cancelRename,
    handleRenameBlur,
    handleRenameKeyDown,
  };
}

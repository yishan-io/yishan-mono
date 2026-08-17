import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMarkdownFile } from "../../helpers/editorLanguage";
import { monaco } from "../../helpers/monacoSetup";
import { useCodeTheme } from "../../ui/hooks/useCodeTheme";
import { editorSettingsStore } from "../../features/settings/state/editorSettingsStore";
import { createMonacoFileEditor, replaceEditorContentPreservingViewState } from "./createMonacoFileEditor";

/** Props for creating and syncing the Monaco editor used by FileEditor. */
export type UseMonacoFileEditorProps = {
  path: string;
  content: string;
  isDeleted: boolean;
  focusRequestKey: number;
  onContentChange?: (content: string) => void;
  onSave?: (content: string) => void | Promise<void>;
};

/** Return type for the hook — includes mode/isDark for the FileEditor component. */
export type UseMonacoFileEditorReturn = {
  editorHostRef: React.RefObject<HTMLDivElement | null>;
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
  currentContent: string;
  isMarkdown: boolean;
  handleSaveCurrentContent: () => void;
  handleMarkdownPreviewContentChange: (nextContent: string) => void;
  mode: "light" | "dark";
  isDark: boolean;
  editorFontSize: number;
};

/** Creates and synchronizes the Monaco editor instance for FileEditor. */
export function useMonacoFileEditor({
  path,
  content,
  isDeleted,
  focusRequestKey,
  onContentChange,
  onSave,
}: UseMonacoFileEditorProps): UseMonacoFileEditorReturn {
  const { themeName, mode } = useCodeTheme();
  const editorFontSize = editorSettingsStore((s) => s.editorFontSize);
  const wordWrapEnabled = editorSettingsStore((s) => s.wordWrap);

  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [currentContent, setCurrentContent] = useState(content);
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);
  const isMarkdown = useMemo(() => isMarkdownFile(path), [path]);

  // Store create-time values in refs so the create effect doesn't
  // depend on them (avoiding editor recreation on settings changes).
  const themeNameRef = useRef(themeName);
  themeNameRef.current = themeName;
  const fontSizeRef = useRef(editorFontSize);
  fontSizeRef.current = editorFontSize;
  const wordWrapRef = useRef(wordWrapEnabled);
  wordWrapRef.current = wordWrapEnabled;

  useEffect(() => {
    contentRef.current = content;
    setCurrentContent(content);
  }, [content]);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  const handleSaveCurrentContent = useCallback(() => {
    const currentEditorContent = editorRef.current?.getValue() ?? contentRef.current;
    // fire-and-forget: keyboard handlers cannot await the caller-owned save operation.
    void onSaveRef.current?.(currentEditorContent);
  }, []);

  // ── Create / destroy editor when path or isDeleted changes ──
  // Markdown files are edited by the Vditor WYSIWYG editor instead — no Monaco
  // instance is created for them (contentRef stays the shared content source).
  useEffect(() => {
    if (isMarkdown || !editorHostRef.current) {
      return;
    }

    const { editor, model } = createMonacoFileEditor({
      host: editorHostRef.current,
      path,
      content: contentRef.current,
      isDeleted,
      theme: themeNameRef.current,
      fontSize: fontSizeRef.current,
      wordWrap: wordWrapRef.current ? "on" : "off",
      onContentChange: (nextContent) => {
        contentRef.current = nextContent;
        setCurrentContent(nextContent);
        onContentChangeRef.current?.(nextContent);
      },
    });

    editorRef.current = editor;
    setEditorInstance(editor);

    // Monaco auto-focuses its textarea on create. Blur it so focus stays
    // where the user was (e.g. file tree). Focus is managed explicitly
    // by the focusRequestKey effect when the user actually wants it.
    if (typeof editor.getDomNode === "function") {
      const monacoTextarea = editor.getDomNode()?.querySelector("textarea");
      if (monacoTextarea instanceof HTMLTextAreaElement) {
        monacoTextarea.blur();
      }
    }

    return () => {
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      setEditorInstance(null);
    };
  }, [isDeleted, isMarkdown, path]);

  // ── Sync external content changes into the editor ──
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === content) {
      return;
    }

    replaceEditorContentPreservingViewState(editor, content);
  }, [content]);

  // ── Set Monaco theme when it changes (without recreating the editor) ──
  useEffect(() => {
    monaco.editor.setTheme(themeName);
  }, [themeName]);

  // ── Update editor options live when fontSize/wordWrap change ──
  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize: editorFontSize,
      wordWrap: wordWrapEnabled ? "on" : "off",
    });
  }, [editorFontSize, wordWrapEnabled]);

  useEffect(() => {
    editorRef.current?.updateOptions?.({ readOnly: isDeleted });
  }, [isDeleted]);

  useEffect(() => {
    if (focusRequestKey <= 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusRequestKey]);

  const handleMarkdownPreviewContentChange = useCallback((nextContent: string) => {
    const editor = editorRef.current;
    contentRef.current = nextContent;

    if (editor && editor.getValue() !== nextContent) {
      replaceEditorContentPreservingViewState(editor, nextContent);
      return;
    }

    setCurrentContent(nextContent);
    onContentChangeRef.current?.(nextContent);
  }, []);

  return {
    editorHostRef,
    editorRef,
    editorInstance,
    currentContent,
    isMarkdown,
    handleSaveCurrentContent,
    handleMarkdownPreviewContentChange,
    mode,
    isDark: mode === "dark",
    editorFontSize,
  };
}

import { useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMarkdownFile } from "../../helpers/editorLanguage";
import { YISHAN_THEME_DARK, YISHAN_THEME_LIGHT, monaco } from "../../helpers/monacoSetup";
import { createMonacoFileEditor } from "./createMonacoFileEditor";

/** Props for creating and syncing the Monaco editor used by FileEditor. */
export type UseMonacoFileEditorProps = {
  path: string;
  content: string;
  isDeleted: boolean;
  focusRequestKey: number;
  onContentChange?: (content: string) => void;
  onSave?: (content: string) => void | Promise<void>;
};

/** Creates and synchronizes the Monaco editor instance for FileEditor. */
export function useMonacoFileEditor({
  path,
  content,
  isDeleted,
  focusRequestKey,
  onContentChange,
  onSave,
}: UseMonacoFileEditorProps) {
  const theme = useTheme();
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [currentContent, setCurrentContent] = useState(content);
  const [markdownPreviewImmediateUpdateToken, setMarkdownPreviewImmediateUpdateToken] = useState(0);
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);
  const isMarkdown = useMemo(() => isMarkdownFile(path), [path]);
  const monacoTheme = useMemo(
    () => (theme.palette.mode === "dark" ? YISHAN_THEME_DARK : YISHAN_THEME_LIGHT),
    [theme.palette.mode],
  );

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

  useEffect(() => {
    if (!editorHostRef.current) {
      return;
    }

    const { editor, model } = createMonacoFileEditor({
      host: editorHostRef.current,
      path,
      content: contentRef.current,
      isDeleted,
      theme: monacoTheme,
      onContentChange: (nextContent) => {
        setCurrentContent(nextContent);
        onContentChangeRef.current?.(nextContent);
      },
      onSave: (nextContent) => {
        void onSaveRef.current?.(nextContent);
      },
    });

    editorRef.current = editor;
    setEditorInstance(editor);

    return () => {
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      setEditorInstance(null);
    };
  }, [isDeleted, monacoTheme, path]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === content) {
      return;
    }

    editor.setValue(content);
  }, [content]);

  useEffect(() => {
    monaco.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

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
    setMarkdownPreviewImmediateUpdateToken((token) => token + 1);

    if (editor && editor.getValue() !== nextContent) {
      editor.setValue(nextContent);
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
    markdownPreviewImmediateUpdateToken,
    isMarkdown,
    handleMarkdownPreviewContentChange,
  };
}

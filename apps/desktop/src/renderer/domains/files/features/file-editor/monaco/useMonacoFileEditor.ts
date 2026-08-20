import { editorSettingsStore } from "@renderer/domains/settings";
import type * as MonacoNs from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCodeTheme } from "../../../../../domains/settings";
import { createMonacoFileEditor, replaceEditorContentPreservingViewState } from "./createMonacoFileEditor";
import { isMarkdownFile } from "./editorLanguage";
import { loadMonacoSetup } from "./monacoLoader";

// Serializes editor creation per host element. Async creation (lazy monaco
// load) can otherwise race: React StrictMode double-invokes mount effects on
// the same host, and fast path switches start a new create before the previous
// one resolves — two `monaco.editor.create(host)` calls then fight over the
// same element ("Element already has context attribute"). Queueing per host
// makes each create wait for the previous create+dispose lifecycle to finish.
const editorCreateQueues = new WeakMap<HTMLElement, Promise<void>>();

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
  editorRef: React.RefObject<MonacoNs.editor.IStandaloneCodeEditor | null>;
  editorInstance: MonacoNs.editor.IStandaloneCodeEditor | null;
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
  const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
  const [currentContent, setCurrentContent] = useState(content);
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);
  const isMarkdown = useMemo(() => isMarkdownFile(path), [path]);

  // Track the latest focus request so creation can honor a request that
  // arrived while monaco was still loading (the rAF effect below misses it
  // because editorRef is still null during the cold-load window).
  const focusRequestKeyRef = useRef(focusRequestKey);
  focusRequestKeyRef.current = focusRequestKey;

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
  // The creation resolves asynchronously after monacoSetup loads; a stale
  // resolution (path changed before it finished) disposes its own instance.
  useEffect(() => {
    if (isMarkdown || !editorHostRef.current) {
      return;
    }

    const host = editorHostRef.current;
    let disposed = false;
    let createdEditor: MonacoNs.editor.IStandaloneCodeEditor | null = null;
    let createdModel: MonacoNs.editor.ITextModel | null = null;

    const createRun = (editorCreateQueues.get(host) ?? Promise.resolve())
      .then(() =>
        createMonacoFileEditor({
          host,
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
        }),
      )
      .then(({ editor, model }) => {
        if (disposed) {
          editor.dispose();
          model.dispose();
          return;
        }

        createdEditor = editor;
        createdModel = model;
        editorRef.current = editor;
        setEditorInstance(editor);

        // Content may have changed while monaco was loading; the content-sync
        // effect already ran with editorRef still null, so sync here or a save
        // would write the stale creation-time content over the newer store content.
        if (editor.getValue() !== contentRef.current) {
          replaceEditorContentPreservingViewState(editor, contentRef.current);
        }

        // Monaco auto-focuses its textarea on create. When the user explicitly
        // requested focus (focusRequestKey > 0) keep it; otherwise blur it so
        // focus stays where the user was (e.g. file tree). Focus is managed
        // explicitly by the focusRequestKey effect for later requests.
        if (focusRequestKeyRef.current > 0) {
          editor.focus();
        } else if (typeof editor.getDomNode === "function") {
          const monacoTextarea = editor.getDomNode()?.querySelector("textarea");
          if (monacoTextarea instanceof HTMLTextAreaElement) {
            monacoTextarea.blur();
          }
        }
      })
      .catch((error) => {
        // Monaco load failure (cold-start transform error, broken chunk): leave
        // the editor absent instead of crashing; the loader resets so a later
        // mount retries.
        console.error("Failed to create Monaco editor", error);
      });
    // Errors are consumed above; the queue must stay resolvable so later
    // creates on the same host are not blocked.
    editorCreateQueues.set(
      host,
      createRun.then(
        () => undefined,
        () => undefined,
      ),
    );

    return () => {
      disposed = true;
      createdEditor?.dispose();
      createdModel?.dispose();
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
    let cancelled = false;
    void loadMonacoSetup()
      .then(({ monaco }) => {
        if (!cancelled) {
          monaco.editor.setTheme(themeName);
        }
      })
      .catch((error) => {
        console.error("Failed to load Monaco theme", error);
      });
    return () => {
      cancelled = true;
    };
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

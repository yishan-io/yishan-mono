import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { Box, Typography, useTheme } from "@mui/material";
import { EditorView, basicSetup } from "codemirror";
import { useEffect, useMemo, useRef } from "react";
import { getLanguageExtension } from "../helpers/editorLanguage";
import { DARK_SURFACE_COLORS } from "../theme";

type FileEditorProps = {
  path: string;
  content: string;
  focusRequestKey?: number;
  onContentChange?: (content: string) => void;
  onSave?: (content: string) => void | Promise<void>;
};

/** Builds the CodeMirror surface style so light and dark themes remain readable. */
function createEditorTheme(mode: "light" | "dark") {
  const isDark = mode === "dark";

  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
        backgroundColor: isDark ? DARK_SURFACE_COLORS.mainPane : "#ffffff",
        color: isDark ? "#d4dbe8" : "#1f2430",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
        lineHeight: 1.5,
      },
      ".cm-content": {
        padding: "12px 0",
      },
      ".cm-line": {
        padding: "0 12px",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: isDark ? "#d7deef" : "#2a2a31",
      },
      ".cm-activeLine": {
        backgroundColor: isDark ? DARK_SURFACE_COLORS.activeLine : "#f1f3f7",
      },
      ".cm-activeLineGutter": {
        backgroundColor: isDark ? DARK_SURFACE_COLORS.activeLine : "#f1f3f7",
      },
      ".cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: isDark ? "rgba(221, 226, 233, 0.12)" : "#ced7ec",
      },
      ".cm-gutters": {
        backgroundColor: isDark ? DARK_SURFACE_COLORS.gutter : "#f5f6f8",
        color: isDark ? "#8e97ab" : "#7a8190",
        borderRight: `1px solid ${isDark ? DARK_SURFACE_COLORS.border : "#dde0e6"}`,
      },
    },
    { dark: isDark },
  );
}

/** Builds syntax tokens tuned for brighter contrast on dark surfaces. */
function createEditorSyntaxTheme(mode: "light" | "dark") {
  const isDark = mode === "dark";

  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: isDark ? "#c49fff" : "#8a3ffc" },
      { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: isDark ? "#d4dbe8" : "#1f2430" },
      { tag: [tags.propertyName], color: isDark ? "#86d0ff" : "#0b6ea8" },
      { tag: [tags.processingInstruction, tags.string, tags.inserted], color: isDark ? "#a7d56d" : "#2d7a00" },
      { tag: [tags.function(tags.variableName), tags.labelName], color: isDark ? "#79c4ff" : "#0060b8" },
      { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: isDark ? "#ffd57a" : "#9a6100" },
      { tag: [tags.definition(tags.name), tags.separator], color: isDark ? "#f1c7ff" : "#8d3a96" },
      { tag: [tags.className], color: isDark ? "#ffb86b" : "#b04900" },
      {
        tag: [tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace],
        color: isDark ? "#ffa86f" : "#bd5500",
      },
      { tag: [tags.typeName], color: isDark ? "#8ad9ff" : "#006b99" },
      { tag: [tags.operator, tags.operatorKeyword], color: isDark ? "#c0c8d8" : "#3f4758" },
      { tag: [tags.url, tags.escape, tags.regexp, tags.link], color: isDark ? "#7ed9b2" : "#007a5c" },
      { tag: [tags.meta, tags.comment], color: isDark ? "#7f8796" : "#7a8190", fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strikethrough, textDecoration: "line-through" },
      { tag: tags.link, textDecoration: "underline" },
      { tag: tags.heading, fontWeight: "bold", color: isDark ? "#79c4ff" : "#005fb8" },
      { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: isDark ? "#f8c777" : "#a45f00" },
      { tag: tags.invalid, color: isDark ? "#ff8b8b" : "#c01717" },
    ]),
  );
}

/** Renders a CodeMirror file editor with local edit tracking and Cmd/Ctrl+S save shortcut. */
export function FileEditor({ path, content, focusRequestKey = 0, onContentChange, onSave }: FileEditorProps) {
  const theme = useTheme();
  const editorTheme = useMemo(() => createEditorTheme(theme.palette.mode), [theme.palette.mode]);
  const editorSyntaxTheme = useMemo(() => createEditorSyntaxTheme(theme.palette.mode), [theme.palette.mode]);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    contentRef.current = content;
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

    const languageExtension = getLanguageExtension(path);
    const languageExtensions: Extension[] = languageExtension ? [languageExtension] : [];

    const editorState = EditorState.create({
      doc: contentRef.current,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        ...languageExtensions,
        editorTheme,
        editorSyntaxTheme,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }

          onContentChangeRef.current?.(update.state.doc.toString());
        }),
        keymap.of([
          indentWithTab,
          {
            key: "Mod-s",
            run: () => {
              void onSaveRef.current?.(editorViewRef.current?.state.doc.toString() ?? "");
              return true;
            },
          },
        ]),
      ],
    });

    const editorView = new EditorView({
      state: editorState,
      parent: editorHostRef.current,
    });

    editorViewRef.current = editorView;

    return () => {
      editorView.destroy();
      editorViewRef.current = null;
    };
  }, [editorSyntaxTheme, editorTheme, path]);

  useEffect(() => {
    const editorView = editorViewRef.current;
    if (!editorView) {
      return;
    }

    const currentDoc = editorView.state.doc.toString();
    if (currentDoc === content) {
      return;
    }

    editorView.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: content },
    });
  }, [content]);

  useEffect(() => {
    if (focusRequestKey <= 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      editorViewRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusRequestKey]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          minHeight: 34,
          px: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          bgcolor: (muiTheme) =>
            muiTheme.palette.mode === "dark" ? DARK_SURFACE_COLORS.gutter : muiTheme.palette.background.paper,
        }}
      >
        <Typography variant="caption" color="text.secondary" noWrap>
          {path}
        </Typography>
      </Box>
      <Box
        ref={editorHostRef}
        sx={{
          flex: 1,
          minHeight: 0,
          "& .cm-editor": {
            height: "100%",
          },
          "& .cm-gutters": {
            borderRight: 1,
            borderColor: "divider",
            bgcolor: (muiTheme) =>
              muiTheme.palette.mode === "dark" ? DARK_SURFACE_COLORS.gutter : muiTheme.palette.background.paper,
          },
        }}
      />
    </Box>
  );
}

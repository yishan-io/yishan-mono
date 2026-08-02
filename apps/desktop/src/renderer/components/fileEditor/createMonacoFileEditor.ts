import { MONO_FONT_FAMILY } from "../../helpers/codeThemes";
import { getLanguageId } from "../../helpers/editorLanguage";
import { ensureEditorThemes, monaco } from "../../helpers/monacoSetup";

/** Props for creating the Monaco editor instance used by FileEditor. */
export type CreateMonacoFileEditorProps = {
  host: HTMLDivElement;
  path: string;
  content: string;
  isDeleted: boolean;
  theme: string;
  fontSize: number;
  wordWrap: "on" | "off";
  onContentChange: (content: string) => void;
};

/** Replaces editor content without resetting the user's selection or viewport. */
export function replaceEditorContentPreservingViewState(editor: monaco.editor.IStandaloneCodeEditor, content: string) {
  const selections = editor.getSelections();
  const scrollPosition = { scrollTop: editor.getScrollTop(), scrollLeft: editor.getScrollLeft() };

  editor.setValue(content);

  if (selections) {
    editor.setSelections(selections);
  }
  editor.setScrollPosition(scrollPosition);
}

/** Creates the Monaco editor instance and backing model for a file. */
export function createMonacoFileEditor({
  host,
  path,
  content,
  isDeleted,
  theme,
  fontSize,
  wordWrap,
  onContentChange,
}: CreateMonacoFileEditorProps) {
  ensureEditorThemes();
  const language = getLanguageId(path) ?? undefined;
  const fileUri = monaco.Uri.file(path);
  const existingModel = monaco.editor.getModel(fileUri);
  const model = existingModel ?? monaco.editor.createModel(content, language, fileUri);

  if (existingModel) {
    monaco.editor.setModelLanguage(model, language ?? "plaintext");
    model.setValue(content);
  }

  const editor = monaco.editor.create(host, {
    model,
    theme,
    fontSize,
    fontFamily: MONO_FONT_FAMILY,
    lineHeight: 1.5,
    wordWrap,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 12 },
    renderLineHighlight: "line",
    tabSize: 2,
    insertSpaces: true,
    readOnly: isDeleted,
  });

  editor.onDidChangeModelContent(() => {
    onContentChange(editor.getValue());
  });

  return { editor, model };
}

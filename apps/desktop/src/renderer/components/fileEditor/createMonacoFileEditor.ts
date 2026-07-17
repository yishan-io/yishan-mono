import { getLanguageId } from "../../helpers/editorLanguage";
import { ensureEditorThemes, monaco } from "../../helpers/monacoSetup";

/** Props for creating the Monaco editor instance used by FileEditor. */
export type CreateMonacoFileEditorProps = {
  host: HTMLDivElement;
  path: string;
  content: string;
  isDeleted: boolean;
  theme: string;
  onContentChange: (content: string) => void;
  onSave: (content: string) => void;
};

/** Creates the Monaco editor instance and backing model for a file. */
export function createMonacoFileEditor({
  host,
  path,
  content,
  isDeleted,
  theme,
  onContentChange,
  onSave,
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
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    lineHeight: 1.5,
    wordWrap: "on",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 12 },
    renderLineHighlight: "line",
    tabSize: 2,
    insertSpaces: true,
    readOnly: isDeleted,
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    onSave(editor.getValue());
  });

  editor.onDidChangeModelContent(() => {
    onContentChange(editor.getValue());
  });

  return { editor, model };
}

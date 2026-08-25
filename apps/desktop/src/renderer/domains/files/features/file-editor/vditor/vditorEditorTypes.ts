/** Languages Vditor ships built-in i18n for (toolbar tooltips etc.). */
export type VditorLang =
  | "de_DE"
  | "en_US"
  | "es_ES"
  | "fr_FR"
  | "ja_JP"
  | "ko_KR"
  | "pt_BR"
  | "ru_RU"
  | "sv_SE"
  | "vi_VN"
  | "zh_CN"
  | "zh_TW";

/** The Vditor APIs used by consumers after the editor has mounted. */
export interface VditorEditorHandle {
  /** The underlying editor API needed for theme updates. */
  vditor: {
    setTheme(theme: "dark" | "classic", contentTheme?: undefined, codeTheme?: "github" | "github-dark"): void;
  };
  /** Returns the current markdown content. */
  getValue(): string;
  /** Replaces the editor content without re-firing the input callback. */
  setValue(markdown: string): void;
  /** Synchronously returns current markdown (alias for getValue). */
  flush(): string;
  /** Destroys the editor and cleans up all resources. */
  destroy(): void;
  /** Enables or disables read-only mode. */
  setReadOnly(readOnly: boolean): void;
  /** Focuses the editor. */
  focus(): void;
}

/** Configuration used to create one Vditor editor instance. */
export interface VditorEditorOptions {
  /** Initial markdown content to load into the editor. */
  defaultValue: string;
  /** Whether the editor should use dark theme. */
  isDark: boolean;
  /** Vditor UI language (toolbar tooltips, hints). Defaults to en_US. */
  lang?: VditorLang;
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
  /** Called on every user edit with the current markdown string. */
  onMarkdownChange: (markdown: string) => void;
}

/** A StrictMode-safe claim on an editor mounted into one root element. */
export interface AcquiredVditorEditor {
  /** Resolves to the shared editor handle once created. */
  promise: Promise<VditorEditorHandle>;
  /** Releases this mount's claim; destroys the editor when the last mount leaves. */
  release(): void;
}

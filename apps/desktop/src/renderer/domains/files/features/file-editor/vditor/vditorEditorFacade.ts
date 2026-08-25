import type { AcquiredVditorEditor, VditorEditorHandle, VditorLang } from "./vditorEditorTypes";

/** Options accepted by the files-domain Vditor editor facade. */
export interface VditorEditorFacadeOptions {
  /** Initial markdown content to load into the editor. */
  defaultValue: string;
  /** Whether the editor should use dark theme. */
  isDark: boolean;
  /** Vditor UI language (toolbar tooltips, hints). */
  lang: VditorLang;
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
}

/** Public Vditor contract, loaded only by consumers that mount an editor. */
export interface VditorEditorFacade {
  /** Acquires a StrictMode-safe editor instance for the root element. */
  acquireEditor(
    root: HTMLElement,
    options: VditorEditorFacadeOptions,
    emitContent: (markdown: string) => void,
  ): AcquiredVditorEditor;
}

/**
 * Maps the app's runtime language ("en", "zh", …) to a Vditor i18n code.
 * Falls back to en_US for unsupported languages.
 */
export function resolveVditorLang(appLanguage: string | undefined): VditorLang {
  const base = appLanguage?.split(/[-_]/)[0]?.toLowerCase();
  if (base === "zh") return "zh_CN";
  if (base === "de") return "de_DE";
  if (base === "es") return "es_ES";
  if (base === "fr") return "fr_FR";
  if (base === "ja") return "ja_JP";
  if (base === "ko") return "ko_KR";
  if (base === "pt") return "pt_BR";
  if (base === "ru") return "ru_RU";
  if (base === "sv") return "sv_SE";
  if (base === "vi") return "vi_VN";
  return "en_US";
}

/**
 * Loads the Vditor implementation and its CSS only when an editor is mounted.
 * The baseline stylesheet deliberately loads before the scoped app theme.
 */
export async function loadVditorEditor(): Promise<VditorEditorFacade> {
  await import("vditor/dist/index.css");
  await import("./vditorTheme.css");
  const { acquireVditorEditor } = await import("./vditorEditorRegistry");

  return {
    acquireEditor: acquireVditorEditor,
  };
}

export type { VditorEditorHandle };

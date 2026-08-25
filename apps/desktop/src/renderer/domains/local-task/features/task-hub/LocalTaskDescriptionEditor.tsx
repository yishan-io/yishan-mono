/**
 * Dialog-safe Markdown editor for a Local Task description.
 *
 * The editor owns Vditor's imperative lifecycle while keeping the description
 * value controlled by the parent dialog.
 */

import { Box, useTheme } from "@mui/material";
import { type VditorEditorHandle, loadVditorEditor, resolveVditorLang } from "@renderer/domains/files";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const editorRootSx = {
  height: { xs: 280, sm: 360 },
  minHeight: 280,
};

function setEditorAccessibility(root: HTMLElement, ariaLabel: string, disabled: boolean): void {
  const editingSurface = root.querySelector<HTMLElement>(".vditor-ir [contenteditable]");
  if (!editingSurface) return;

  editingSurface.setAttribute("role", "textbox");
  editingSurface.setAttribute("aria-label", ariaLabel);
  editingSurface.setAttribute("aria-multiline", "true");
  editingSurface.setAttribute("aria-readonly", String(disabled));
  editingSurface.setAttribute("aria-disabled", String(disabled));
}

export interface LocalTaskDescriptionEditorProps {
  /** Markdown content shown in the editor. */
  value: string;
  /** Receives Markdown entered by the user. */
  onChange: (markdown: string) => void;
  /** Makes the editor read-only while the parent is submitting. */
  disabled: boolean;
  /** Accessible name for the Markdown editor. */
  ariaLabel: string;
  /** Placeholder text shown when the editor is empty. */
  placeholder: string;
}

/** Mounts a Vditor Markdown editor that is safe to use inside a dialog. */
export function LocalTaskDescriptionEditor({
  value,
  onChange,
  disabled,
  ariaLabel,
  placeholder,
}: LocalTaskDescriptionEditorProps) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<VditorEditorHandle | null>(null);
  const lastEmittedValueRef = useRef(value);
  const latestValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const isDisabledRef = useRef(disabled);
  const ariaLabelRef = useRef(ariaLabel);
  const isDarkRef = useRef(theme.palette.mode === "dark");
  const isDark = theme.palette.mode === "dark";
  const vditorLang = resolveVditorLang(i18n.language);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    isDisabledRef.current = disabled;
    ariaLabelRef.current = ariaLabel;
    const handle = handleRef.current;
    if (!handle) return;

    handle.setReadOnly(disabled);
    const root = rootRef.current;
    if (root) {
      setEditorAccessibility(root, ariaLabel, disabled);
    }
  }, [ariaLabel, disabled]);

  useEffect(() => {
    latestValueRef.current = value;
    const handle = handleRef.current;
    if (!handle || value === lastEmittedValueRef.current) return;

    handle.setValue(value);
    lastEmittedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    isDarkRef.current = isDark;
    const handle = handleRef.current;
    if (!handle) return;

    handle.vditor.setTheme(isDark ? "dark" : "classic", undefined, isDark ? "github-dark" : "github");
  }, [isDark]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let isUnmounted = false;
    let release: (() => void) | null = null;

    loadVditorEditor()
      .then((editor) => {
        if (isUnmounted) return null;

        const acquired = editor.acquireEditor(
          root,
          {
            defaultValue: lastEmittedValueRef.current,
            isDark: isDarkRef.current,
            lang: vditorLang,
            placeholder,
          },
          (markdown) => {
            if (isUnmounted || isDisabledRef.current) return;

            lastEmittedValueRef.current = markdown;
            onChangeRef.current(markdown);
          },
        );
        release = acquired.release;
        return acquired.promise;
      })
      .then((handle) => {
        if (!handle) return;
        if (isUnmounted) return;

        handleRef.current = handle;
        handle.setReadOnly(isDisabledRef.current);
        setEditorAccessibility(root, ariaLabelRef.current, isDisabledRef.current);
        if (latestValueRef.current !== lastEmittedValueRef.current) {
          handle.setValue(latestValueRef.current);
          lastEmittedValueRef.current = latestValueRef.current;
        }
      })
      .catch((error: unknown) => {
        console.error("[LocalTaskDescriptionEditor] editor creation failed:", getErrorMessage(error));
      });

    return () => {
      isUnmounted = true;
      if (handleRef.current) {
        handleRef.current = null;
      }
      release?.();
    };
  }, [placeholder, vditorLang]);

  return <Box ref={rootRef} className="vditor-app-editor" data-theme={isDark ? "dark" : "light"} sx={editorRootSx} />;
}

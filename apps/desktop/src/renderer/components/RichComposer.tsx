import { Box } from "@mui/material";
import type { ClipboardEvent, KeyboardEvent, SyntheticEvent } from "react";
import { useRef } from "react";

type RichComposerProps = {
  placeholder: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void | Promise<void>;
  minHeight?: number;
  disabled?: boolean;
};

const TOKEN_REGEX = /(https?:\/\/[^\s]+|\/[a-zA-Z][\w-]*|@[\w./-]+)/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeComposerText(value: string): string {
  return value.replaceAll("\u00A0", " ").replaceAll("\r\n", "\n");
}

function renderComposerHtml(value: string): string {
  const escaped = escapeHtml(value);
  const tokenized = escaped.replaceAll(TOKEN_REGEX, (token) => {
    if (token.startsWith("http://") || token.startsWith("https://")) {
      return `<a class="composer-link" href="${token}" target="_blank" rel="noreferrer">${token}</a>`;
    }
    if (token.startsWith("/")) {
      return `<span class="composer-slash">${token}</span>`;
    }
    if (token.startsWith("@")) {
      return `<span class="composer-mention">${token}</span>`;
    }
    return token;
  });

  return tokenized.replaceAll("\n", "<br>");
}

function getCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return 0;
  }
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(root);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return preCaretRange.toString().length;
}

function setCaretOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const text = currentNode.textContent ?? "";
    const end = traversed + text.length;
    if (offset <= end) {
      const range = document.createRange();
      range.setStart(currentNode, Math.max(0, offset - traversed));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    traversed = end;
    currentNode = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function RichComposer({ placeholder, onChange, onSubmit, minHeight = 84, disabled = false }: RichComposerProps) {
  const composerRef = useRef<HTMLDivElement | null>(null);

  const handleComposerInput = (event: SyntheticEvent<HTMLDivElement>) => {
    const editable = event.currentTarget;
    const caretOffset = getCaretOffset(editable);
    const nextValue = normalizeComposerText(editable.innerText);
    const nextHtml = renderComposerHtml(nextValue);

    onChange?.(nextValue);

    if (editable.innerHTML !== nextHtml) {
      editable.innerHTML = nextHtml;
      setCaretOffset(editable, caretOffset);
    }
  };

  const handleComposerPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    const plainText = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, plainText);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !onSubmit) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    const editable = event.currentTarget;
    const nextValue = normalizeComposerText(editable.innerText).trim();
    if (!nextValue) {
      return;
    }

    void onSubmit(nextValue);
    editable.innerHTML = "";
    onChange?.("");
  };

  return (
    <Box
      ref={composerRef}
      component="div"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label={placeholder}
      aria-disabled={disabled}
      data-placeholder={placeholder}
      onInput={handleComposerInput}
      onPaste={handleComposerPaste}
      onKeyDown={handleComposerKeyDown}
      sx={{
        p: 1.5,
        minHeight,
        outline: "none",
        typography: "body2",
        color: "text.primary",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowY: "auto",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "text",
        pointerEvents: disabled ? "none" : "auto",
        "&:empty:before": {
          content: "attr(data-placeholder)",
          color: "text.disabled",
        },
        "& .composer-link": {
          color: "primary.main",
          textDecoration: "underline",
        },
        "& .composer-slash": {
          color: "warning.main",
          fontWeight: 600,
        },
        "& .composer-mention": {
          color: "success.main",
        },
      }}
    />
  );
}

import { openLink } from "@renderer/commands/appCommands";
import { buildWorkspaceFileUrl } from "@renderer/commands/fileCommands";
import { openTabInOppositePane } from "@renderer/commands/tabCommands";
import { tabStore } from "@renderer/store/tabStore";
import { enqueueWorkspaceErrorNotice } from "@renderer/store/workspaceLifecycleNoticeStore";
import { getTaskListItemChecked, isAbsoluteUrl, resolveRelativePath, toggleTaskListItem } from "./markdownHelpers";
import { type MarkdownOutlineData, extractMarkdownOutline } from "./markdownOutlineTree";

const workspaceImageUrlCache = new Map<string, string>();

async function openMarkdownLink(url: string): Promise<void> {
  const result = await openLink({ url });

  if (result.opened) {
    return;
  }

  enqueueWorkspaceErrorNotice({
    title: "Failed to open link",
    message: `Could not open link in external app (${result.reason}).`,
  });
}

function extractMermaidBlocks(container: HTMLElement): Array<{ id: string; code: string }> {
  const mermaidPres = new Set<HTMLElement>();
  for (const pre of Array.from(container.querySelectorAll("pre.mermaid"))) {
    mermaidPres.add(pre as HTMLElement);
  }
  for (const codeEl of Array.from(container.querySelectorAll("pre code.language-mermaid"))) {
    const pre = codeEl.closest("pre");
    if (pre) {
      mermaidPres.add(pre as HTMLElement);
    }
  }

  const blocks: Array<{ id: string; code: string }> = [];
  let mermaidIndex = 0;
  for (const pre of mermaidPres) {
    const code = pre.textContent?.replace(/\n$/, "") ?? "";
    const id = `mermaid-placeholder-${mermaidIndex}`;
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-mermaid-id", id);
    pre.replaceWith(placeholder);
    blocks.push({ id, code });
    mermaidIndex += 1;
  }

  return blocks;
}

function resolveWorkspaceImageUrls(container: HTMLElement, worktreePath: string, fileDir: string): boolean {
  const images = Array.from(container.querySelectorAll("img"));
  for (const image of images) {
    const src = image.getAttribute("src");
    if (!src || isAbsoluteUrl(src)) {
      return true;
    }

    const cleanSrc = src.replace(/[?#].*$/, "");
    const relativePath = resolveRelativePath(fileDir, cleanSrc);
    const cacheKey = `${worktreePath}:${relativePath}`;
    const cachedUrl = workspaceImageUrlCache.get(cacheKey);

    if (cachedUrl) {
      image.src = cachedUrl;
      return true;
    }

    try {
      const protocolUrl = buildWorkspaceFileUrl({ workspaceWorktreePath: worktreePath, relativePath });
      workspaceImageUrlCache.set(cacheKey, protocolUrl);
      image.src = protocolUrl;
    } catch {
      // Leave original src on failure.
    }
  }

  return false;
}

function openWorkspaceFileInOppositePane(href: string, fileDir: string): void {
  const cleanPath = href.replace(/[?#].*$/, "");
  const resolvedPath = resolveRelativePath(fileDir, cleanPath);
  if (resolvedPath) {
    openTabInOppositePane({ kind: "file", path: resolvedPath });
  }
}

function attachLinkHandlers(container: HTMLElement, worktreePath: string | undefined, fileDir: string): void {
  const links = Array.from(container.querySelectorAll("a[href]"));
  for (const link of links) {
    link.addEventListener("click", (event: Event) => {
      // Detect cmd+click (macOS) or ctrl+click (Windows/Linux) for opposite-pane open
      const isOppositeOpen = event instanceof MouseEvent && (event.metaKey || event.ctrlKey);

      event.preventDefault();
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      if (isAbsoluteUrl(href)) {
        if (isOppositeOpen) {
          // Open external URL in a browser tab on the opposite pane
          const workspaceId = undefined; // resolveActiveWorkspaceId is handled internally by openTabInOppositePane
          openTabInOppositePane({ kind: "browser", url: href });
        } else {
          void openMarkdownLink(href);
        }
        return;
      }

      if (!worktreePath) {
        return;
      }

      if (isOppositeOpen) {
        openWorkspaceFileInOppositePane(href, fileDir);
      } else {
        const cleanPath = href.replace(/[?#].*$/, "");
        const resolvedPath = resolveRelativePath(fileDir, cleanPath);
        if (resolvedPath) {
          tabStore.getState().openTab({ kind: "file", path: resolvedPath });
        }
      }
    });
  }
}

function attachTaskListHandlers(
  container: HTMLElement,
  content: string,
  canEdit: boolean,
  onContentChange?: (content: string) => void,
): void {
  const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"));
  for (const [index, checkbox] of checkboxes.entries()) {
    checkbox.disabled = !canEdit;
    if (!canEdit) {
      continue;
    }

    checkbox.addEventListener("click", (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentChecked = getTaskListItemChecked(content, index);
      if (currentChecked === null) {
        return;
      }

      const nextContent = toggleTaskListItem(content, index, !currentChecked);
      if (nextContent !== content) {
        onContentChange?.(nextContent);
      }
    });
  }
}

export function postProcessMarkdownPreview({
  container,
  html,
  worktreePath,
  fileDir,
  canEdit,
  content,
  onContentChange,
}: {
  container: HTMLElement;
  html: string;
  worktreePath?: string;
  fileDir: string;
  canEdit: boolean;
  content: string;
  onContentChange?: (content: string) => void;
}): {
  mermaidBlocks: Array<{ id: string; code: string }>;
  outlineData: MarkdownOutlineData | null;
} {
  container.innerHTML = html;

  const mermaidBlocks = extractMermaidBlocks(container);

  if (worktreePath && resolveWorkspaceImageUrls(container, worktreePath, fileDir)) {
    return {
      mermaidBlocks,
      outlineData: null,
    };
  }

  attachLinkHandlers(container, worktreePath, fileDir);
  attachTaskListHandlers(container, content, canEdit, onContentChange);

  return {
    mermaidBlocks,
    outlineData: extractMarkdownOutline(container),
  };
}

const HIGHLIGHT_CLASS = "md-find-highlight";
const ACTIVE_CLASS = "md-find-highlight-active";

/**
 * Removes all `<mark class="md-find-highlight">` spans inserted by `highlightMatches`,
 * restoring the original text nodes.
 */
export function clearHighlights(container: HTMLElement): void {
  const marks = Array.from(container.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT_CLASS}`));
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  }
}

/**
 * Wraps all text-node ranges matching `query` (case-insensitive) in
 * `<mark class="md-find-highlight">` elements inside `container`.
 * Returns the total number of matches found.
 *
 * Call `setActiveMatch` afterwards to highlight the current match index.
 */
export function highlightMatches(container: HTMLElement, query: string): number {
  clearHighlights(container);
  if (!query) return 0;

  const lowerQuery = query.toLowerCase();
  const queryLen = query.length;
  let count = 0;

  // Collect text nodes first to avoid iterator invalidation during DOM mutation.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text inside existing highlight marks (shouldn't exist after clearHighlights, but guard anyway).
      if ((node.parentElement as HTMLElement)?.closest?.(`mark.${HIGHLIGHT_CLASS}`)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    const lowerText = text.toLowerCase();

    // Find all match offsets within this text node.
    const offsets: number[] = [];
    let pos = 0;
    while (pos <= text.length - queryLen) {
      const idx = lowerText.indexOf(lowerQuery, pos);
      if (idx === -1) break;
      offsets.push(idx);
      pos = idx + queryLen;
    }

    if (offsets.length === 0) continue;

    // Split the text node and wrap each match in a <mark>.
    // We work right-to-left so earlier offsets remain valid after each split.
    const remaining: Text = textNode;
    for (let i = offsets.length - 1; i >= 0; i--) {
      const offset = offsets[i] as number;
      // Split off everything after the match.
      const after = remaining.splitText(offset + queryLen);
      void after; // stays in the DOM
      // Split off everything before the match — `remaining` now holds only the match text.
      const matchNode = remaining.splitText(offset);
      // `remaining` is now the prefix; `matchNode` is the matched text.
      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      mark.appendChild(matchNode.cloneNode(true));
      matchNode.parentNode?.replaceChild(mark, matchNode);
      count += 1;
    }
  }

  return count;
}

/**
 * Marks the `index`-th `<mark>` element as active (adds `md-find-highlight-active` class)
 * and scrolls it into view. Clears the active class from all other marks.
 * Does nothing if there are no marks or `index` is out of range.
 */
export function setActiveMatch(container: HTMLElement, index: number): void {
  const marks = Array.from(container.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT_CLASS}`));
  for (const [i, mark] of marks.entries()) {
    if (i === index) {
      mark.classList.add(ACTIVE_CLASS);
      mark.scrollIntoView?.({ block: "nearest" });
    } else {
      mark.classList.remove(ACTIVE_CLASS);
    }
  }
}

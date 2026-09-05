const BOTTOM_SCROLL_THRESHOLD_PX = 48;

/** Scroll snapshots retained while a transcript tab is inactive. */
export const agentMessageScrollState = {
  savedRenderedItemCountByTabId: new Map<string, number>(),
  savedScrollTopByTabId: new Map<string, number>(),
  wasPinnedToBottomByTabId: new Map<string, boolean>(),
};

/** Tests whether a transcript scroller is near its lower boundary. */
export function isScrolledNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= BOTTOM_SCROLL_THRESHOLD_PX;
}

import type { Href, Router } from "expo-router";

/** Owns the shared "back if possible, otherwise replace" navigation fallback. */
export function goBackOrReplace(router: Router, href: Href) {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(href);
}

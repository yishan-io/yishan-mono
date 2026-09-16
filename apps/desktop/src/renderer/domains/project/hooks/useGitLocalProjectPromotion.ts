import { useEffect, useRef } from "react";
import { createGitLocalProjectPromotionRuntime } from "../runtime/gitLocalProjectPromotionRuntime";
import { projectStore } from "../state/projectStore";

/** Mounts git-local project promotion for the workspace view lifetime. */
export function useGitLocalProjectPromotion(): void {
  const isProjectsLoaded = projectStore((state) => state.isProjectsLoaded);
  const runtimeRef = useRef<ReturnType<typeof createGitLocalProjectPromotionRuntime> | null>(null);
  if (runtimeRef.current === null) {
    runtimeRef.current = createGitLocalProjectPromotionRuntime();
  }

  useEffect(() => {
    if (!isProjectsLoaded) {
      return;
    }
    return runtimeRef.current?.start();
  }, [isProjectsLoaded]);
}

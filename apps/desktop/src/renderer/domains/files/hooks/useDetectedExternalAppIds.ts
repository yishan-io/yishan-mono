import { useEffect, useState } from "react";
import { listDetectedExternalAppIds } from "../commands/fileCommands";
import type { ExternalAppId } from "../infrastructure/externalApps";

/** Resolves detected external-app ids from the desktop host bridge. */
export function useDetectedExternalAppIds(): readonly ExternalAppId[] | null | undefined {
  const [detectedExternalAppIds, setDetectedExternalAppIds] = useState<ExternalAppId[] | null | undefined>(undefined);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const detectedAppIds = await listDetectedExternalAppIds();
        if (isCancelled) {
          return;
        }

        setDetectedExternalAppIds(detectedAppIds);
      } catch {
        if (!isCancelled) {
          setDetectedExternalAppIds(null);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [listDetectedExternalAppIds]);

  return detectedExternalAppIds;
}

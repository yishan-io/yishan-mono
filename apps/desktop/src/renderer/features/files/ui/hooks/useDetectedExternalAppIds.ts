import { useEffect, useState } from "react";
import type { ExternalAppId } from "../../../../../shared/contracts/externalApps";
import { useFileCommands } from "../../../../app/commands/useCommands";

/** Resolves detected external-app ids from the desktop host bridge. */
export function useDetectedExternalAppIds(): readonly ExternalAppId[] | null | undefined {
  const { listDetectedExternalAppIds } = useFileCommands();
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

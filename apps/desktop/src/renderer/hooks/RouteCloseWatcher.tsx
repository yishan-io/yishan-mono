import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type RouteCloseWatcherProps = {
  onClose: () => void;
};

/**
 * Null-rendering component that calls `onClose` whenever the current
 * route pathname moves away from the workspace root (`"/"`).
 * Use inside controls that host a dropdown or popover that should
 * dismiss on navigation.
 */
export function RouteCloseWatcher({ onClose }: RouteCloseWatcherProps) {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") {
      onClose();
    }
  }, [location.pathname, onClose]);

  return null;
}

import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";

export function useWorkspaceDiffPreviewLayout() {
  const [availableWidth, setAvailableWidth] = useState(0);
  const minPreviewWidth = Math.max(availableWidth, 0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setAvailableWidth((current) => (Math.abs(current - nextWidth) < 1 ? current : nextWidth));
  }, []);

  return {
    handleLayout,
    minPreviewWidth,
  };
}

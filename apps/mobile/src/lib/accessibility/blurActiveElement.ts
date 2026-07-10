import { Platform } from "react-native";

export function blurActiveElement() {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement && "blur" in activeElement && typeof activeElement.blur === "function") {
    activeElement.blur();
  }
}

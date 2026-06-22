import { useEffect, useState } from "react";
import { Dimensions, Keyboard, type KeyboardEvent, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function resolveKeyboardBottomInset(event: KeyboardEvent, bottomInset: number): number {
  const windowHeight = Dimensions.get("window").height;
  const keyboardTop = event.endCoordinates.screenY;
  return Math.max(0, windowHeight - keyboardTop - bottomInset);
}

export function useKeyboardBottomInset() {
  const { bottom } = useSafeAreaInsets();
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);

  useEffect(() => {
    const handleKeyboardChange = (event: KeyboardEvent) => {
      setKeyboardBottomInset(resolveKeyboardBottomInset(event, bottom));
    };
    const handleKeyboardHide = () => {
      setKeyboardBottomInset(0);
    };

    const changeEventName = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEventName = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const changeSubscription = Keyboard.addListener(changeEventName, handleKeyboardChange);
    const hideSubscription = Keyboard.addListener(hideEventName, handleKeyboardHide);

    return () => {
      changeSubscription.remove();
      hideSubscription.remove();
    };
  }, [bottom]);

  return keyboardBottomInset;
}

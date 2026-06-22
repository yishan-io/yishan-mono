import { Keyboard } from "react-native";

import { blurActiveElement } from "./blurActiveElement";

export function dismissActiveKeyboard() {
  Keyboard.dismiss();
  blurActiveElement();
}

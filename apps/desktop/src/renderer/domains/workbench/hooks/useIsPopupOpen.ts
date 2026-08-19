import { popupStore } from "../state/popupStore";

/** Subscribes to the Workbench popup/dialog open state. */
export function useIsPopupOpen(): boolean {
  return popupStore((state) => state.isPopupOpen);
}

type PressAction = {
  onPress: () => void;
};

/**
 * Wraps an action so the sheet closes before the action executes.
 */
export function wrapActionWithClose<T extends PressAction>(action: T, onClose: () => void): T {
  return {
    ...action,
    onPress: () => {
      onClose();
      action.onPress();
    },
  };
}

/**
 * Wraps a list of actions so the sheet closes before each action executes.
 */
export function wrapActionsWithClose<T extends PressAction>(
  actions: T[] | null | undefined,
  onClose: () => void,
): T[] | undefined {
  return actions?.map((action) => wrapActionWithClose(action, onClose));
}

import { ActionSheetContent } from "@/components/ui/ActionSheetContent";
import { AppModalSheet } from "@/components/ui/AppModalSheet";

type WorkspaceEntryMenuSheetProps = {
  entryName: string;
  actions: Array<{
    destructive?: boolean;
    disabled?: boolean;
    label: string;
    onPress: () => void;
  }>;
  onClose: () => void;
  open: boolean;
};

export function WorkspaceEntryMenuSheet({ actions, entryName, onClose, open }: WorkspaceEntryMenuSheetProps) {
  const handledActions = actions.map((action) => ({
    ...action,
    onPress: () => {
      if (action.disabled) {
        return;
      }

      action.onPress();
      onClose();
    },
  }));

  return (
    <AppModalSheet open={open} onClose={onClose} position="bottom">
      <ActionSheetContent actions={handledActions} title={entryName} />
    </AppModalSheet>
  );
}

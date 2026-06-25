import { ActionSheetContent } from "@/components/ui/ActionSheetContent";
import { AppModalSheet } from "@/components/ui/AppModalSheet";

type ActionMenuSheetProps = {
  actions: Array<{ destructive?: boolean; label: string; onPress: () => void }>;
  onClose: () => void;
  open: boolean;
  title: string;
};

// Owns only sheet presentation for delegated project/workspace actions.
export function ActionMenuSheet({ actions, onClose, open, title }: ActionMenuSheetProps) {
  return (
    <AppModalSheet open={open} onClose={onClose} position="bottom">
      <ActionSheetContent actions={actions} title={title} />
    </AppModalSheet>
  );
}

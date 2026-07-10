import { ActionSheetContent } from "@/components/ui/ActionSheetContent";
import { AppModalSheet } from "@/components/ui/AppModalSheet";

type ShellTerminalUploadImageSheetProps = {
  onChooseFile: () => void;
  onClose: () => void;
  onOpenPhotoLibrary: () => void;
  onTakePhoto: () => void;
  open: boolean;
  title: string;
  chooseFileLabel: string;
  photoLibraryLabel: string;
  takePhotoLabel: string;
};

/** Owns the source picker used before inserting one image path into the terminal. */
export function ShellTerminalUploadImageSheet({
  chooseFileLabel,
  onChooseFile,
  onClose,
  onOpenPhotoLibrary,
  onTakePhoto,
  open,
  photoLibraryLabel,
  takePhotoLabel,
  title,
}: ShellTerminalUploadImageSheetProps) {
  return (
    <AppModalSheet onClose={onClose} open={open} position="bottom">
      <ActionSheetContent
        actions={[
          { label: photoLibraryLabel, onPress: onOpenPhotoLibrary },
          { label: takePhotoLabel, onPress: onTakePhoto },
          { label: chooseFileLabel, onPress: onChooseFile },
        ]}
        title={title}
      />
    </AppModalSheet>
  );
}

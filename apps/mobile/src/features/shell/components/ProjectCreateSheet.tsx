import { Button, Input, Paragraph, Text } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import { useProjectCreateSheetModel } from "../view-model/useProjectCreateSheetModel";

type ProjectCreateSheetProps = {
  onClose: () => void;
  open: boolean;
  organizationId: string | null;
};

export function ProjectCreateSheet({ onClose, open, organizationId }: ProjectCreateSheetProps) {
  const model = useProjectCreateSheetModel({ onClose, organizationId });

  return (
    <AppModalSheet open={open} onClose={model.handleClose} position="bottom">
      <Text fontSize="$8" fontWeight="800">
        {model.t("shell.newProject")}
      </Text>
      <Input value={model.name} onChangeText={model.onChangeName} placeholder={model.t("shell.projectName")} />
      <Input
        value={model.repoUrl}
        onChangeText={model.onChangeRepoUrl}
        placeholder={model.t("shell.projectGitUrlOptional")}
      />
      {model.formErrors.name ? <Paragraph color="$red10">{model.formErrors.name}</Paragraph> : null}
      {model.formErrors.repoUrl ? <Paragraph color="$red10">{model.formErrors.repoUrl}</Paragraph> : null}
      <Button themeInverse onPress={model.onSubmit} disabled={model.isSubmitDisabled}>
        {model.t("shell.createProject")}
      </Button>
    </AppModalSheet>
  );
}

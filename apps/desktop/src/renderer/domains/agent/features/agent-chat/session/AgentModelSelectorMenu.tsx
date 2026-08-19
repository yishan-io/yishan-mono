import type { MutableRefObject } from "react";
import type { AgentModel } from "../../../../../domains/agent/agentChatTypes";
import { buildModelPickerOption } from "../../../modelPicker";
import { ModelPickerMenu } from "../../select-model/ModelPickerMenu";

type AgentModelSelectorMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  models: AgentModel[];
  currentModel: AgentModel | null;
  selectedProvider: string;
  ignoreNextClickAwayRef: MutableRefObject<boolean>;
  onClose: () => void;
  onProviderChange: (provider: string) => void;
  onModelSelect: (model: AgentModel) => void;
};

/** Backward-compatible wrapper around the shared popup model picker. */
export function AgentModelSelectorMenu({
  anchorEl,
  open,
  models,
  currentModel,
  selectedProvider,
  ignoreNextClickAwayRef,
  onClose,
  onProviderChange,
  onModelSelect,
}: AgentModelSelectorMenuProps) {
  const options = models.map((model) =>
    buildModelPickerOption({
      id: model.id,
      name: model.name,
      providerId: model.provider?.trim(),
    }),
  );

  return (
    <ModelPickerMenu
      anchorEl={anchorEl}
      open={open}
      options={options}
      selectedModelId={currentModel?.id ?? null}
      selectedProviderId={selectedProvider}
      ignoreNextClickAwayRef={ignoreNextClickAwayRef}
      onClose={onClose}
      onProviderChange={onProviderChange}
      onModelSelect={(option) => {
        const nextModel = models.find((model) => model.id === option.id);
        if (!nextModel) {
          return;
        }
        onModelSelect(nextModel);
      }}
    />
  );
}

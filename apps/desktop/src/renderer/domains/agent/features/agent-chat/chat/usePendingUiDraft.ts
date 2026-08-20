import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentPendingUiRequest } from "../../../chat/agentChatTypes";

export type SelectOption = {
  index?: number;
  value: string;
  label: string;
  description?: string;
};

export type ParsedMultiSelectPrompt = {
  question: string;
  options: Array<SelectOption & { index: number }>;
  allowFreeform: boolean;
};

export type PendingUiDraft = {
  draft: string;
  setDraft: (value: string) => void;
  isSelectingCustomResponse: boolean;
  draftBeforeCustomResponse: string | null;
  selectedMultiSelectIndices: number[];
  selectOptions: SelectOption[] | undefined;
  renderedSelectOptions: SelectOption[] | undefined;
  parsedMultiSelectPrompt: ParsedMultiSelectPrompt | null;
  handleSubmit: () => Promise<void>;
  handleSelectOption: (value: string) => Promise<void>;
  handleBeginCustomResponse: () => void;
  handleBackToOptions: () => void;
  handleToggleMultiSelectIndex: (index: number) => void;
  handleConfirmMultiSelect: () => Promise<void>;
};

/** Parses a multi-select draft into the selected option indices. */
export function parseSelectedMultiSelectIndices(
  draft: string,
  options: Array<{
    index: number;
    label: string;
  }>,
): number[] {
  const optionIndexByLabel = new Map(options.map((option) => [option.label, option.index]));

  return draft
    .split(",")
    .map((token) => token.trim())
    .flatMap((token) => {
      if (token.length === 0) {
        return [];
      }

      const numericIndex = Number.parseInt(token, 10);
      if (Number.isInteger(numericIndex) && String(numericIndex) === token) {
        return options.some((option) => option.index === numericIndex) ? [numericIndex] : [];
      }

      const matchedIndex = optionIndexByLabel.get(token);
      return typeof matchedIndex === "number" ? [matchedIndex] : [];
    })
    .filter((index, position, allIndices) => allIndices.indexOf(index) === position)
    .sort((left, right) => left - right);
}

type UsePendingUiDraftInput = {
  request: AgentPendingUiRequest;
  onCancel: () => Promise<void> | void;
  onConfirm: (input: { value?: string; confirmed?: boolean }) => Promise<void> | void;
  onSelectCustomResponse: (value: string) => Promise<void> | void;
};

/** Owns the draft/custom-response/multi-select state and handlers for one pending UI prompt. */
export function usePendingUiDraft({
  request,
  onCancel,
  onConfirm,
  onSelectCustomResponse,
}: UsePendingUiDraftInput): PendingUiDraft {
  const [draft, setDraft] = useState(request.prefill ?? "");
  const [isSelectingCustomResponse, setIsSelectingCustomResponse] = useState(false);
  const [draftBeforeCustomResponse, setDraftBeforeCustomResponse] = useState<string | null>(null);
  const [selectedMultiSelectIndices, setSelectedMultiSelectIndices] = useState<number[]>([]);

  useEffect(() => {
    setDraft(request.prefill ?? "");
    setIsSelectingCustomResponse(false);
    setDraftBeforeCustomResponse(null);
  }, [request.id, request.prefill]);

  const selectOptions = useMemo<SelectOption[] | undefined>(() => {
    return request.options?.map((option) => ({
      index: option.index,
      value: option.value,
      label: option.label,
      description: option.description,
    }));
  }, [request.options]);

  const parsedMultiSelectPrompt = useMemo<ParsedMultiSelectPrompt | null>(() => {
    if (request.method !== "input" || request.selectionMode !== "multiple" || !selectOptions) {
      return null;
    }

    return {
      question: request.title,
      options: selectOptions.filter(
        (option): option is SelectOption & { index: number } => typeof option.index === "number",
      ),
      allowFreeform: request.allowFreeform === true,
    };
  }, [request.allowFreeform, request.method, request.selectionMode, request.title, selectOptions]);

  useEffect(() => {
    if (!parsedMultiSelectPrompt) {
      setSelectedMultiSelectIndices([]);
      return;
    }

    const nextSelectedIndices = parseSelectedMultiSelectIndices(draft, parsedMultiSelectPrompt.options);
    setSelectedMultiSelectIndices(nextSelectedIndices);
  }, [draft, parsedMultiSelectPrompt]);

  const renderedSelectOptions = selectOptions;

  const handleSubmit = useCallback(async () => {
    if (request.method === "select" && isSelectingCustomResponse) {
      await onSelectCustomResponse(draft);
      return;
    }

    await onConfirm({ value: draft });
  }, [draft, isSelectingCustomResponse, onConfirm, onSelectCustomResponse, request.method]);

  const handleSelectOption = useCallback(
    async (optionValue: string) => {
      await onConfirm({ value: optionValue });
    },
    [onConfirm],
  );

  const handleBeginCustomResponse = useCallback(() => {
    setDraftBeforeCustomResponse(draft);
    setDraft(request.prefill ?? "");
    setIsSelectingCustomResponse(true);
  }, [draft, request.prefill]);

  const handleBackToOptions = useCallback(() => {
    setIsSelectingCustomResponse(false);
    setDraft(draftBeforeCustomResponse ?? request.prefill ?? "");
    setDraftBeforeCustomResponse(null);
  }, [draftBeforeCustomResponse, request.prefill]);

  const handleToggleMultiSelectIndex = useCallback((index: number) => {
    setSelectedMultiSelectIndices((currentIndices) => {
      const nextIndices = currentIndices.includes(index)
        ? currentIndices.filter((currentIndex) => currentIndex !== index)
        : [...currentIndices, index].sort((left, right) => left - right);
      setDraft(nextIndices.join(", "));
      return nextIndices;
    });
  }, []);

  const handleConfirmMultiSelect = useCallback(async () => {
    await onConfirm({ value: selectedMultiSelectIndices.join(", ") });
  }, [onConfirm, selectedMultiSelectIndices]);

  return {
    draft,
    setDraft,
    isSelectingCustomResponse,
    draftBeforeCustomResponse,
    selectedMultiSelectIndices,
    selectOptions,
    renderedSelectOptions,
    parsedMultiSelectPrompt,
    handleSubmit,
    handleSelectOption,
    handleBeginCustomResponse,
    handleBackToOptions,
    handleToggleMultiSelectIndex,
    handleConfirmMultiSelect,
  };
}

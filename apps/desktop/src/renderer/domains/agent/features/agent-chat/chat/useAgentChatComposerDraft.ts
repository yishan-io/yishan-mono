import { searchFiles } from "@renderer/domains/files";
import { renameTab } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { generateId } from "@shared/ids/generateId";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentModel } from "../../../chat/agentChatTypes";
import { abortAgent, compactAgent, sendAgentPrompt } from "../../../commands/agentChatCommands";
import { formatAgentSessionTitle } from "../../../skills/agentSkillText";
import { agentChatStore } from "../../../state/agentChatStore";
import { setAgentModel, setAgentThinkingLevel } from "../../../subscriptions/agentChatPiEventShared";
import { transformAgentChatPromptForSkills } from "./agentChatSkillPromptTransform";
import type { ComposerAttachment } from "./composer/ComposerAttachmentBlock";
import type { RichComposerSlashCommand } from "./composer/RichComposer";
import type { DroppedFileEntry } from "./composer/RichComposer";

const MAX_FILE_MENTION_RESULTS = 50;

type UseAgentChatComposerDraftInput = {
  tabId: string;
  workspaceId: string;
  sessionId: string | null;
  sessionState: string;
  messageCount: number;
  hasStreamingMessage: boolean;
  /** Whether the tab was renamed by the user (suppresses the auto title rename). */
  userRenamed: boolean | undefined;
  slashCommands: RichComposerSlashCommand[];
};

/** Owns composer draft text, attachments, submit, and session-control actions. */
export function useAgentChatComposerDraft(input: UseAgentChatComposerDraftInput) {
  const { tabId, workspaceId, sessionId, sessionState, messageCount, hasStreamingMessage, userRenamed, slashCommands } =
    input;
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const pendingImageReads = useRef(new Map<string, FileReader>());
  const [isManualCompactPending, setIsManualCompactPending] = useState(false);

  useEffect(() => {
    const readers = pendingImageReads.current;
    return () => {
      const pending = [...readers.values()];
      readers.clear();
      for (const reader of pending) reader.abort();
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "idle") {
      setIsManualCompactPending(false);
    }
  }, [sessionState]);

  const handleSubmit = useCallback(
    async (value: string): Promise<boolean> => {
      const prompt = value.trim();
      if (!sessionId || (!prompt && attachments.length === 0) || pendingImageReads.current.size > 0) return false;
      if (attachments.some((a) => a.kind === "image" && !a.data)) return false;

      if (prompt && messageCount === 0 && !hasStreamingMessage && !userRenamed) {
        renameTab(tabId, formatAgentSessionTitle(prompt));
      }

      const nextMessage = await transformAgentChatPromptForSkills(prompt, slashCommands);

      const fileParts = attachments.filter((a) => a.kind === "file").map((a) => a.path);
      const pasteParts = attachments.filter((a) => a.kind === "paste").map((a) => a.content);
      const parts: string[] = [];
      if (fileParts.length > 0) parts.push(`Files:\n${fileParts.join("\n")}`);
      if (pasteParts.length > 0) parts.push(`Pasted content:\n${pasteParts.join("\n\n---\n\n")}`);
      const finalMessage =
        parts.length > 0 ? (nextMessage ? `${nextMessage}\n\n${parts.join("\n\n")}` : parts.join("\n\n")) : nextMessage;

      try {
        const images = attachments.flatMap((a) =>
          a.kind === "image" && a.data ? [{ type: "image" as const, data: a.data, mimeType: a.mimeType }] : [],
        );
        await sendAgentPrompt({ tabId, sessionId, message: finalMessage, ...(images.length ? { images } : {}) });
      } catch (error) {
        agentChatStore.getState().setTurnError(tabId, getErrorMessage(error));
        return false;
      }
      setAttachments((current) => current.filter((a) => !attachments.some((sent) => sent.id === a.id)));
      return true;
    },
    [attachments, hasStreamingMessage, messageCount, sessionId, slashCommands, tabId, userRenamed],
  );

  const handleAddFile = useCallback((path: string, isDirectory = false) => {
    setAttachments((prev) => {
      if (prev.some((attachment) => attachment.kind === "file" && attachment.path === path)) {
        return prev;
      }
      return [
        ...prev,
        {
          kind: "file" as const,
          id: generateId(),
          path,
          name: path.split(/[\\/]/).pop() ?? path,
          isDirectory,
        },
      ];
    });
  }, []);

  const handleFilesDrop = useCallback(
    (entries: DroppedFileEntry[]) => {
      for (const entry of entries) {
        handleAddFile(entry.path, entry.isDirectory);
      }
    },
    [handleAddFile],
  );

  const handleMentionFileSearch = useCallback(
    (query: string) => searchFiles({ workspaceId, query, limit: MAX_FILE_MENTION_RESULTS, includeDirectories: true }),
    [workspaceId],
  );

  const handlePasteBlock = useCallback((text: string) => {
    const lineCount = text.split("\n").filter((l) => l.trim()).length;
    setAttachments((prev) => [...prev, { kind: "paste" as const, id: generateId(), content: text, lineCount }]);
  }, []);

  const handleImagesPaste = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const id = generateId();
        const reader = new FileReader();
        pendingImageReads.current.set(id, reader);
        setAttachments((prev) => [...prev, { kind: "image", id, name: file.name, mimeType: file.type }]);
        const finish = (data?: string, readError?: string) => {
          if (pendingImageReads.current.get(id) !== reader) return;
          pendingImageReads.current.delete(id);
          const error = data ? undefined : (readError ?? `Could not read image: ${file.name}. Remove it and paste it again.`);
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, data, error } : a)));
          if (error) agentChatStore.getState().setTurnError(tabId, error);
        };
        reader.onload = () => {
          const result = reader.result;
          finish(typeof result === "string" ? result.slice(result.indexOf(",") + 1) : undefined);
        };
        reader.onerror = () => finish();
        reader.onabort = () => finish();
        try {
          reader.readAsDataURL(file);
        } catch (error) {
          finish(undefined, getErrorMessage(error));
        }
      }
    },
    [tabId],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    const reader = pendingImageReads.current.get(id);
    pendingImageReads.current.delete(id);
    reader?.abort();
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAbort = useCallback(async () => {
    if (!sessionId) return;
    try {
      await abortAgent({ tabId, sessionId });
    } catch (error) {
      agentChatStore.getState().setTurnError(tabId, getErrorMessage(error));
    }
  }, [sessionId, tabId]);

  const handleCompact = useCallback(async () => {
    if (!sessionId || isManualCompactPending) return;

    setIsManualCompactPending(true);
    try {
      await compactAgent({ sessionId });
    } catch (error) {
      agentChatStore.getState().setTurnError(tabId, getErrorMessage(error));
      setIsManualCompactPending(false);
    }
  }, [isManualCompactPending, sessionId, tabId]);

  const handleSubmitButtonClick = useCallback(async () => {
    const nextDraft = draft.trim();
    if (!nextDraft && attachments.length === 0) return;
    const sent = await handleSubmit(nextDraft);
    if (sent) {
      setDraft("");
    }
  }, [attachments.length, draft, handleSubmit]);

  const handleVoiceText = useCallback((text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }

    setDraft((currentDraft) => {
      const separator =
        currentDraft.length === 0 || currentDraft.endsWith(" ") || currentDraft.endsWith("\n") ? "" : " ";
      return `${currentDraft}${separator}${normalizedText}`;
    });
  }, []);

  const handleModelChange = useCallback(
    async (model: AgentModel) => {
      if (!sessionId) return;
      try {
        await setAgentModel({ tabId, sessionId, provider: model.provider ?? "", modelId: model.id });
      } catch (error) {
        agentChatStore.getState().setTurnError(tabId, getErrorMessage(error));
      }
    },
    [sessionId, tabId],
  );

  const handleThinkingSelect = useCallback(
    async (level: string) => {
      if (!sessionId) return;
      try {
        await setAgentThinkingLevel({ tabId, sessionId, level });
      } catch (error) {
        agentChatStore.getState().setTurnError(tabId, getErrorMessage(error));
      }
    },
    [sessionId, tabId],
  );

  return {
    draft,
    setDraft,
    attachments,
    isManualCompactPending,
    handleSubmit,
    handleAddFile,
    handleFilesDrop,
    handleMentionFileSearch,
    handlePasteBlock,
    handleImagesPaste,
    handleRemoveAttachment,
    handleAbort,
    handleCompact,
    handleSubmitButtonClick,
    handleVoiceText,
    handleModelChange,
    handleThinkingSelect,
  };
}
